import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma } from '@cifrao/db';
import {
  type CsvMapping,
  DUPLICATE_DAY_WINDOW,
  accountDeltaCents,
  findDuplicate,
  matchCategoryRule,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { ImportParseError, decodeUpload, detectFormat, parseImport, previewCsv } from './parsers';
import type { ParsedTransaction } from './parsers';

export const IMPORT_PROCESS_QUEUE = 'import.process';
export const IMPORT_CONFIRM_QUEUE = 'import.confirm';

/** Linhas gravadas por vez — evita segurar milhares de objetos na memória. */
const CHUNK = 200;

/** Dias em torno da linha usados para buscar candidatos a duplicata no banco. */
const LOOKUP_WINDOW_DAYS = DUPLICATE_DAY_WINDOW + 1;

interface JobData {
  batchId: string;
}

/**
 * Regra 5.12 — todo o processamento da importação roda aqui, em job do pg-boss:
 * parse, detecção de duplicata, sugestão de categoria e, na confirmação, a
 * criação dos lançamentos. O request HTTP só enfileira e consulta o progresso.
 */
@Injectable()
export class ImportsProcessor implements OnModuleInit {
  private readonly logger = new Logger(ImportsProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.work<JobData>(IMPORT_PROCESS_QUEUE, (data) => this.process(data.batchId));
      await this.queue.work<JobData>(IMPORT_CONFIRM_QUEUE, (data) => this.confirm(data.batchId));
    } catch (err) {
      this.logger.error(`Workers de importação não subiram: ${(err as Error).message}`);
    }
  }

  // ─── Job 1: ler o arquivo e montar o staging ────────────────────────────────

  async process(batchId: string): Promise<void> {
    const db = this.prisma.client;
    const batch = await db.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) return;

    try {
      await db.importBatch.update({
        where: { id: batchId },
        data: { status: 'PARSING', progress: 0, error: null },
      });

      const content = decodeUpload(batch.rawContent);
      const format = batch.format ?? detectFormat(content, batch.filename);
      if (!format) throw new ImportParseError('Não reconheci o formato do arquivo.');

      const mapping = (batch.columnMapping as CsvMapping | null) ?? null;

      // CSV sem mapeamento: só inspeciona e devolve a prévia de 5 linhas.
      if (format === 'CSV' && !mapping) {
        const inspection = previewCsv(content);
        await db.importBatch.update({
          where: { id: batchId },
          data: {
            status: 'NEEDS_MAPPING',
            progress: 100,
            totalRows: inspection.rowCount,
            preview: inspection as unknown as Prisma.InputJsonValue,
          },
        });
        return;
      }

      const parsed = await parseImport(format, content, mapping);

      // Reprocessamento (troca de mapeamento) começa do zero.
      await db.importRow.deleteMany({ where: { batchId } });

      // O dono vem do próprio lote: o job carrega só o batchId.
      const userId = batch.userId;

      const [rules, existing, forecasts] = await Promise.all([
        db.categoryRule.findMany({ where: { userId, active: true } }),
        this.existingForDedupe(userId, batch.accountId, parsed.transactions),
        this.forecastsForMatch(userId, batch.accountId, parsed.transactions),
      ]);

      let duplicates = 0;
      const usedForecasts = new Set<string>();

      for (let offset = 0; offset < parsed.transactions.length; offset += CHUNK) {
        const slice = parsed.transactions.slice(offset, offset + CHUNK);
        const data = slice.map((tx) => {
          const duplicate = findDuplicate(
            { date: tx.date, amountCents: tx.amountCents, description: tx.description, externalId: tx.externalId },
            existing,
          );
          if (duplicate) duplicates += 1;

          // Regra 5.11: previsto que esta linha veio efetivar (um por linha).
          let matchedForecastId: string | null = null;
          if (!duplicate) {
            const forecast = findDuplicate(
              { date: tx.date, amountCents: tx.amountCents, description: tx.description },
              forecasts.filter((f) => !usedForecasts.has(f.id)),
            );
            if (forecast) {
              matchedForecastId = forecast.id;
              usedForecasts.add(forecast.id);
            }
          }

          const rule = matchCategoryRule(rules, {
            description: tx.description,
            amountCents: tx.amountCents,
          });

          return {
            batchId,
            lineNumber: tx.lineNumber,
            raw: tx.raw as Prisma.InputJsonValue,
            date: tx.date,
            amountCents: tx.amountCents,
            description: tx.description,
            originalDescription: tx.description,
            type: tx.type,
            externalId: tx.externalId ?? null,
            status: duplicate ? ('DUPLICATE' as const) : ('PENDING' as const),
            duplicateOfId: duplicate?.id ?? null,
            duplicateScore: duplicate?.score ?? null,
            matchedForecastId,
            categoryId: rule?.categoryId ?? null,
            suggestedCategoryId: rule?.categoryId ?? null,
            matchedRuleId: rule?.ruleId ?? null,
          };
        });

        await db.importRow.createMany({ data });
        await db.importBatch.update({
          where: { id: batchId },
          data: {
            progress: Math.round(((offset + slice.length) / parsed.transactions.length) * 100),
          },
        });
      }

      await db.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'REVIEW',
          progress: 100,
          format,
          totalRows: parsed.transactions.length,
          duplicateRows: duplicates,
          detectedAccountLabel: parsed.accountLabel ?? batch.detectedAccountLabel,
        },
      });
      this.logger.log(
        `Lote ${batchId}: ${parsed.transactions.length} linhas, ${duplicates} duplicatas`,
      );
    } catch (err) {
      const message = err instanceof ImportParseError ? err.message : (err as Error).message;
      this.logger.error(`Falha ao processar ${batchId}: ${message}`);
      await db.importBatch.update({
        where: { id: batchId },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  // ─── Job 2: confirmar — só aqui as linhas viram lançamento ──────────────────

  async confirm(batchId: string): Promise<void> {
    const db = this.prisma.client;
    const batch = await db.importBatch.findUnique({ where: { id: batchId } });
    if (!batch) return;
    if (!batch.accountId) {
      await db.importBatch.update({
        where: { id: batchId },
        data: { status: 'FAILED', error: 'Escolha a conta antes de confirmar a importação.' },
      });
      return;
    }

    try {
      const userId = batch.userId;
      const rows = await db.importRow.findMany({
        where: { batchId, status: 'PENDING' },
        orderBy: { lineNumber: 'asc' },
      });

      let imported = 0;
      for (let offset = 0; offset < rows.length; offset += CHUNK) {
        const slice = rows.slice(offset, offset + CHUNK);

        // Um chunk por transação de banco: ou entra inteiro, ou não entra.
        await db.$transaction(async (tx) => {
          for (const row of slice) {
            const forecast = row.matchedForecastId
              ? await tx.transaction.findFirst({ where: { id: row.matchedForecastId, userId } })
              : null;

            if (forecast && forecast.status === 'FORECAST') {
              // Regra 5.11: o previsto vira efetivado, sem nascer duplicado.
              const updated = await tx.transaction.update({
                where: { id: forecast.id },
                data: {
                  status: 'CLEARED',
                  date: row.date,
                  amountCents: row.amountCents,
                  originalDescription: row.originalDescription,
                  externalId: row.externalId,
                  categoryId: row.categoryId ?? forecast.categoryId,
                },
              });
              await this.applyBalance(tx, updated, 1);
              await tx.importRow.update({
                where: { id: row.id },
                data: { status: 'IMPORTED', transactionId: updated.id },
              });
            } else {
              const created = await tx.transaction.create({
                data: {
                  userId,
                  type: row.type,
                  amountCents: row.amountCents,
                  date: row.date,
                  description: row.description,
                  originalDescription: row.originalDescription,
                  status: 'CLEARED',
                  accountId: batch.accountId,
                  categoryId: row.categoryId,
                  externalId: row.externalId,
                },
              });
              await this.applyBalance(tx, created, 1);
              await tx.importRow.update({
                where: { id: row.id },
                data: { status: 'IMPORTED', transactionId: created.id },
              });
            }
            imported += 1;
          }
        });

        await db.importBatch.update({
          where: { id: batchId },
          data: { progress: Math.round(((offset + slice.length) / Math.max(rows.length, 1)) * 100) },
        });
      }

      // Regras que acertaram a categoria ganham crédito (ordena as mais úteis).
      const applied = await db.importRow.groupBy({
        by: ['matchedRuleId'],
        where: { batchId, status: 'IMPORTED', matchedRuleId: { not: null } },
        _count: { _all: true },
      });
      for (const row of applied) {
        if (!row.matchedRuleId) continue;
        await db.categoryRule.updateMany({
          where: { id: row.matchedRuleId, userId },
          data: { appliedCount: { increment: row._count._all } },
        });
      }

      await db.importBatch.update({
        where: { id: batchId },
        data: {
          status: 'CONFIRMED',
          progress: 100,
          importedRows: imported,
          confirmedAt: new Date(),
        },
      });
      this.logger.log(`Lote ${batchId} confirmado: ${imported} lançamentos criados`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`Falha ao confirmar ${batchId}: ${message}`);
      await db.importBatch.update({
        where: { id: batchId },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  // ─── Apoio ──────────────────────────────────────────────────────────────────

  /**
   * Candidatos a duplicata: mesma conta, dentro da janela de datas do arquivo
   * (regra 5.12). Busca uma vez só — nada de uma query por linha.
   */
  private async existingForDedupe(
    userId: string,
    accountId: string | null,
    rows: ParsedTransaction[],
  ) {
    if (!accountId || rows.length === 0) return [];
    const { from, to } = this.dateRange(rows);
    return this.prisma.client.transaction.findMany({
      where: {
        userId,
        accountId,
        status: { not: 'FORECAST' },
        date: { gte: from, lte: to },
      },
      select: { id: true, date: true, amountCents: true, description: true, externalId: true },
    });
  }

  /** Previstos da mesma conta na janela, para o match da regra 5.11. */
  private async forecastsForMatch(
    userId: string,
    accountId: string | null,
    rows: ParsedTransaction[],
  ) {
    if (!accountId || rows.length === 0) return [];
    const { from, to } = this.dateRange(rows);
    return this.prisma.client.transaction.findMany({
      where: { userId, accountId, status: 'FORECAST', date: { gte: from, lte: to } },
      select: { id: true, date: true, amountCents: true, description: true, externalId: true },
    });
  }

  private dateRange(rows: ParsedTransaction[]): { from: Date; to: Date } {
    let min = rows[0].date.getTime();
    let max = min;
    for (const row of rows) {
      const time = row.date.getTime();
      if (time < min) min = time;
      if (time > max) max = time;
    }
    const slack = LOOKUP_WINDOW_DAYS * 86_400_000;
    return { from: new Date(min - slack), to: new Date(max + slack) };
  }

  private async applyBalance(
    tx: Prisma.TransactionClient,
    row: { type: string; amountCents: bigint; status: string; accountId: string | null },
    sign: 1 | -1,
  ) {
    if (row.status === 'FORECAST' || !row.accountId) return;
    const delta = accountDeltaCents(row as never, row.accountId) * BigInt(sign);
    if (delta !== 0n) {
      await tx.account.update({
        where: { id: row.accountId },
        data: { balanceCents: { increment: delta } },
      });
    }
  }
}
