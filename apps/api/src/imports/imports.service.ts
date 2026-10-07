import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import {
  type ApplyPatternInput,
  type CreateImportInput,
  type CsvMapping,
  type SetImportAccountInput,
  type UpdateImportRowInput,
  countMatchingPattern,
  normalizeDescription,
  suggestRulePattern,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { IMPORT_CONFIRM_QUEUE, IMPORT_PROCESS_QUEUE } from './imports.processor';
import { decodeUpload, detectFormat } from './parsers';

const rowInclude = {
  category: { select: { id: true, name: true, color: true, icon: true } },
  duplicateOf: { select: { id: true, date: true, description: true, amountCents: true } },
  matchedForecast: { select: { id: true, date: true, description: true, amountCents: true } },
} satisfies Prisma.ImportRowInclude;

/**
 * Camada HTTP da importação. Aqui NÃO se processa arquivo: o request só grava o
 * upload, enfileira o job (regra 5.12) e devolve o estado para a UI acompanhar.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async list(userId: string) {
    return this.prisma.client.importBatch.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: {
        id: true,
        filename: true,
        format: true,
        status: true,
        progress: true,
        totalRows: true,
        duplicateRows: true,
        importedRows: true,
        error: true,
        createdAt: true,
        confirmedAt: true,
        account: { select: { id: true, name: true, color: true } },
      },
    });
  }

  /** Estado do lote + linhas em staging (paginado: um extrato pode ser grande). */
  async get(userId: string, id: string, page = 1, pageSize = 100) {
    const batch = await this.prisma.client.importBatch.findFirst({
      where: { id, userId },
      include: { account: { select: { id: true, name: true, color: true } } },
    });
    if (!batch) throw new NotFoundException('Importação não encontrada');

    const [rows, total, counts] = await Promise.all([
      this.prisma.client.importRow.findMany({
        where: { batchId: id },
        orderBy: { lineNumber: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: rowInclude,
      }),
      this.prisma.client.importRow.count({ where: { batchId: id } }),
      this.prisma.client.importRow.groupBy({
        by: ['status'],
        where: { batchId: id },
        _count: { _all: true },
      }),
    ]);

    const byStatus = Object.fromEntries(counts.map((c) => [c.status, c._count._all]));
    // rawContent nunca vai para a UI: é o arquivo inteiro.
    const { rawContent: _rawContent, ...rest } = batch;

    return {
      ...rest,
      rows,
      pagination: { page, pageSize, total },
      counts: {
        pending: byStatus.PENDING ?? 0,
        duplicate: byStatus.DUPLICATE ?? 0,
        ignored: byStatus.IGNORED ?? 0,
        imported: byStatus.IMPORTED ?? 0,
      },
    };
  }

  /** Upload: grava o arquivo e enfileira o parse. Nada é lido no request. */
  async create(userId: string, input: CreateImportInput) {
    const buffer = Buffer.from(input.contentBase64, 'base64');
    if (buffer.length === 0) throw new BadRequestException('Arquivo vazio.');

    // Detecção de formato precisa de um espiar barato no conteúdo.
    const format = input.format ?? detectFormat(decodeUpload(input.contentBase64), input.filename);
    if (!format) {
      throw new BadRequestException('Não reconheci o formato: envie OFX, QIF ou CSV.');
    }

    if (input.accountId) await this.ensureAccount(userId, input.accountId);

    const batch = await this.prisma.client.importBatch.create({
      data: {
        userId,
        filename: input.filename,
        format,
        rawContent: input.contentBase64,
        fileSize: buffer.length,
        accountId: input.accountId ?? null,
        status: 'UPLOADED',
      },
    });

    await this.enqueue(IMPORT_PROCESS_QUEUE, batch.id);
    return { id: batch.id, format, status: batch.status };
  }

  /** Define a conta de destino (a detecção do OFX é só uma sugestão). */
  async setAccount(userId: string, id: string, input: SetImportAccountInput) {
    const batch = await this.requireBatch(userId, id);
    await this.ensureAccount(userId, input.accountId);
    if (batch.status === 'CONFIRMED') {
      throw new BadRequestException('Esta importação já foi confirmada.');
    }

    await this.prisma.client.importBatch.update({
      where: { id },
      data: { accountId: input.accountId },
    });
    // Duplicata depende da conta: com a conta trocada, o staging é refeito.
    if (batch.status === 'REVIEW') await this.enqueue(IMPORT_PROCESS_QUEUE, id);
    return this.get(userId, id);
  }

  /** Só CSV: confirma o mapeamento de colunas e reprocessa. */
  async setMapping(userId: string, id: string, mapping: CsvMapping) {
    const batch = await this.requireBatch(userId, id);
    if (batch.format !== 'CSV') {
      throw new BadRequestException('Mapeamento de colunas só se aplica a CSV.');
    }
    if (batch.status === 'CONFIRMED') {
      throw new BadRequestException('Esta importação já foi confirmada.');
    }

    await this.prisma.client.importBatch.update({
      where: { id },
      data: {
        columnMapping: mapping as unknown as Prisma.InputJsonValue,
        status: 'UPLOADED',
        progress: 0,
        error: null,
      },
    });
    await this.enqueue(IMPORT_PROCESS_QUEUE, id);
    return { ok: true };
  }

  /** Revisão transação a transação: categorizar, ignorar, reincluir duplicata. */
  async updateRow(userId: string, id: string, rowId: string, input: UpdateImportRowInput) {
    // ImportRow não tem dono próprio: o filtro vai pelo lote.
    const row = await this.prisma.client.importRow.findFirst({
      where: { id: rowId, batchId: id, batch: { userId } },
    });
    if (!row) throw new NotFoundException('Linha não encontrada');
    if (input.categoryId) await this.ensureCategory(userId, input.categoryId);
    if (row.status === 'IMPORTED') {
      throw new BadRequestException('Esta linha já virou lançamento.');
    }

    return this.prisma.client.importRow.update({
      where: { id: rowId },
      data: {
        ...(input.categoryId !== undefined ? { categoryId: input.categoryId } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
      },
      include: rowInclude,
    });
  }

  /**
   * Regra 5.12 — "aplicar a todos os N com esse padrão e criar regra".
   * Categoriza as linhas ainda não importadas que casam com o padrão e, por
   * padrão, aprende a `CategoryRule` para as próximas importações.
   */
  async applyPattern(userId: string, id: string, input: ApplyPatternInput) {
    await this.requireBatch(userId, id);
    const pattern = normalizeDescription(input.pattern);
    if (!pattern) throw new BadRequestException('Padrão vazio depois de normalizado.');

    const category = await this.prisma.client.category.findFirst({
      where: { id: input.categoryId, OR: [{ userId }, { userId: null }] },
    });
    if (!category) throw new NotFoundException('Categoria não encontrada');

    const rows = await this.prisma.client.importRow.findMany({
      where: { batchId: id, batch: { userId }, status: { not: 'IMPORTED' } },
      select: { id: true, description: true, amountCents: true },
    });

    const min = input.minCents == null ? null : BigInt(input.minCents);
    const max = input.maxCents == null ? null : BigInt(input.maxCents);
    const targets = rows.filter((row) => {
      if (!normalizeDescription(row.description).includes(pattern)) return false;
      if (min !== null && row.amountCents < min) return false;
      if (max !== null && row.amountCents > max) return false;
      return true;
    });

    if (targets.length > 0) {
      await this.prisma.client.importRow.updateMany({
        where: { id: { in: targets.map((r) => r.id) }, batch: { userId } },
        data: { categoryId: input.categoryId },
      });
    }

    let rule = null;
    if (input.createRule) {
      rule = await this.prisma.client.categoryRule.upsert({
        where: {
          userId_pattern_categoryId: { userId, pattern, categoryId: input.categoryId },
        },
        create: { userId, pattern, categoryId: input.categoryId, minCents: min, maxCents: max },
        update: { minCents: min, maxCents: max, active: true },
      });
    }

    return { applied: targets.length, rule };
  }

  /** Quantas linhas casariam com o padrão — alimenta o "N" do botão na UI. */
  async previewPattern(userId: string, id: string, pattern: string) {
    // Lote de outro dono é 404, como em toda rota por id — não um "0" ambíguo.
    await this.requireBatch(userId, id);
    const rows = await this.prisma.client.importRow.findMany({
      where: { batchId: id, batch: { userId }, status: { not: 'IMPORTED' } },
      select: { description: true },
    });
    return { count: countMatchingPattern(pattern, rows), pattern: normalizeDescription(pattern) };
  }

  /** Sugestão de padrão a partir de uma descrição (pré-preenche o diálogo). */
  suggestPattern(description: string) {
    return { pattern: suggestRulePattern(description) };
  }

  /** Confirmação final: aqui, e só aqui, as linhas viram lançamento. */
  async confirm(userId: string, id: string) {
    const batch = await this.requireBatch(userId, id);
    if (batch.status === 'CONFIRMED') {
      throw new BadRequestException('Esta importação já foi confirmada.');
    }
    if (batch.status !== 'REVIEW') {
      throw new BadRequestException('A importação ainda não está pronta para confirmar.');
    }
    if (!batch.accountId) {
      throw new BadRequestException('Escolha a conta de destino antes de confirmar.');
    }

    const pending = await this.prisma.client.importRow.count({
      where: { batchId: id, batch: { userId }, status: 'PENDING' },
    });
    if (pending === 0) {
      throw new BadRequestException('Nenhuma linha selecionada para importar.');
    }

    await this.prisma.client.importBatch.update({
      where: { id },
      data: { progress: 0, error: null },
    });
    await this.enqueue(IMPORT_CONFIRM_QUEUE, id);
    return { queued: pending };
  }

  /** Descarta o lote inteiro. Só é possível antes da confirmação. */
  async remove(userId: string, id: string) {
    const batch = await this.requireBatch(userId, id);
    if (batch.status === 'CONFIRMED') {
      throw new BadRequestException(
        'Importação já confirmada: exclua os lançamentos criados, se quiser desfazer.',
      );
    }
    await this.prisma.client.importBatch.delete({ where: { id } });
    return { ok: true };
  }

  private async enqueue(queue: string, batchId: string) {
    try {
      await this.queue.send(queue, { batchId });
    } catch (err) {
      throw new BadRequestException(
        `A fila de importação não está disponível: ${(err as Error).message}`,
      );
    }
  }

  private async requireBatch(userId: string, id: string) {
    const batch = await this.prisma.client.importBatch.findFirst({ where: { id, userId } });
    if (!batch) throw new NotFoundException('Importação não encontrada');
    return batch;
  }

  private async ensureAccount(userId: string, id: string) {
    const account = await this.prisma.client.account.findFirst({ where: { id, userId } });
    if (!account) throw new NotFoundException('Conta não encontrada');
  }

  private async ensureCategory(userId: string, id: string) {
    const found = await this.prisma.client.category.count({
      where: { id, OR: [{ userId }, { userId: null }] },
    });
    if (found === 0) throw new NotFoundException('Categoria não encontrada');
  }
}
