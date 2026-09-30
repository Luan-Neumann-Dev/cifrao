import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { PrismaClient } from '@cifrao/db';
import {
  BACKUP_APP,
  BACKUP_MODELS,
  BACKUP_VERSION,
  type BackupCsvQuery,
  DELETE_ACCOUNT_CONFIRMATION,
  MOVEMENT_MODELS,
  type RestoreBackupInput,
  WIPE_CONFIRMATION,
  checkBackupFile,
  formatBRL,
  formatInSaoPaulo,
  fullWipeOrder,
  toCsv,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';

export const RESTORE_QUEUE = 'backup-restore';

export interface RestoreJobData {
  jobId: string;
}

/** Delegate genérico: todo model do client tem estes métodos. */
type AnyDelegate = {
  findMany: (args?: unknown) => Promise<Record<string, unknown>[]>;
  deleteMany: (args?: unknown) => Promise<{ count: number }>;
};

function delegate(db: PrismaClient, model: string): AnyDelegate {
  const found = (db as unknown as Record<string, AnyDelegate>)[model];
  if (!found) throw new Error(`Delegate não encontrado: ${model}`);
  return found;
}

/**
 * Recorte do dono por model. Quatro dos 17 não têm `userId` próprio — são filhos
 * e o dono vem pela relação.
 *
 * `scope` muda o caso da categoria, e a diferença é importante: no EXPORT as
 * universais entram, para o arquivo ficar autossuficiente e as referências dos
 * lançamentos resolverem; no DELETE elas ficam de fora, porque apagar uma
 * universal derrubaria a categoria de todos os usuários.
 */
function ownerWhere(
  model: string,
  userId: string,
  scope: 'export' | 'delete',
): Record<string, unknown> {
  switch (model) {
    case 'transactionSplit':
    case 'transactionTag':
      return { transaction: { userId } };
    case 'investmentTransaction':
    case 'priceHistory':
      return { investment: { userId } };
    case 'category':
      return scope === 'export' ? { OR: [{ userId }, { userId: null }] } : { userId };
    default:
      return { userId };
  }
}

/**
 * Backup e zona de risco (Fase 9).
 *
 * Decisão do dono: **sem storage nesta fase**. O export sai como download e a
 * restauração entra por upload — nada é gravado em disco nem em bucket. O único
 * lugar onde o arquivo repousa é a coluna `RestoreJob.content`, enquanto o job
 * roda, e ela é limpa no fim.
 *
 * A restauração roda em job do pg-boss (armadilha #3): um banco de 24 meses tem
 * milhares de linhas, e isso não pode viver num request HTTP.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Export completo. Sai como objeto e o serializer global do Nest converte
   * BigInt em string (armadilha #2) — é assim que o valor em centavos atravessa
   * o JSON sem perder precisão.
   */
  async exportAll(userId: string) {
    const db = this.prisma.client;
    const data: Record<string, unknown[]> = {};

    // Sequencial de propósito: paralelizar 17 findMany só para esperar todos
    // abriria 17 conexões ao mesmo tempo (armadilha #1) sem ganhar nada aqui.
    for (const { model } of BACKUP_MODELS) {
      data[model] = await delegate(db, model).findMany({
        where: ownerWhere(model, userId, 'export'),
      });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        name: true,
        email: true,
        theme: true,
        accentColor: true,
        notifyInvoiceDue: true,
        notifyBudgetExceeded: true,
        notifyGoalReached: true,
        notifyForecastDue: true,
        notifyDaysBefore: true,
      },
    });

    return {
      app: BACKUP_APP,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      // Perfil e preferências viajam junto; senha, sessão e 2FA nunca.
      profile: user ?? undefined,
      data,
    };
  }

  /** Contagem por seção, para a tela dizer o que vai no arquivo antes de baixar. */
  async exportSummary(userId: string) {
    const db = this.prisma.client;
    const sections: { model: string; label: string; count: number }[] = [];
    for (const { model, label } of BACKUP_MODELS) {
      const count = await (
        db as unknown as Record<string, { count: (args?: unknown) => Promise<number> }>
      )[model].count({ where: ownerWhere(model, userId, 'export') });
      sections.push({ model, label, count });
    }
    return { sections, totalRecords: sections.reduce((acc, s) => acc + s.count, 0) };
  }

  /**
   * CSV por seção. Sem zip (seria dependência nova): cada seção baixa seu
   * arquivo. Formato `;` + BOM, que é o que o Excel em pt-BR abre direto, e o
   * dinheiro vai em duas colunas — centavos para conferir a soma, BRL para ler.
   */
  async exportCsv(
    userId: string,
    query: BackupCsvQuery,
  ): Promise<{ filename: string; content: string }> {
    const db = this.prisma.client;
    const hoje = formatInSaoPaulo(new Date(), 'yyyy-MM-dd');
    const file = (nome: string, content: string) => ({
      filename: `cifrao-${nome}-${hoje}.csv`,
      content,
    });

    switch (query.section) {
      case 'lancamentos': {
        const rows = await db.transaction.findMany({
          where: { userId },
          orderBy: { date: 'desc' },
          include: {
            category: { select: { name: true } },
            account: { select: { name: true } },
            creditCard: { select: { nickname: true } },
          },
        });
        return file(
          'lancamentos',
          toCsv(
            [
              'Data',
              'Descrição',
              'Tipo',
              'Status',
              'Categoria',
              'Conta',
              'Cartão',
              'Parcela',
              'Centavos',
              'Valor',
              'Reembolsável',
              'Observações',
            ],
            rows.map((tx) => [
              formatInSaoPaulo(tx.date),
              tx.description,
              tx.type,
              tx.status,
              tx.category?.name ?? '',
              tx.account?.name ?? '',
              tx.creditCard?.nickname ?? '',
              tx.installmentTotal ? `${tx.installmentNumber}/${tx.installmentTotal}` : '',
              tx.amountCents,
              formatBRL(tx.amountCents),
              tx.isReimbursable ? 'sim' : 'não',
              tx.notes ?? '',
            ]),
          ),
        );
      }

      case 'contas': {
        const rows = await db.account.findMany({
          where: { userId },
          orderBy: { name: 'asc' },
        });
        return file(
          'contas',
          toCsv(
            ['Nome', 'Tipo', 'Instituição', 'Centavos', 'Saldo', 'Arquivada'],
            rows.map((a) => [
              a.name,
              a.type,
              a.institution ?? '',
              a.balanceCents,
              formatBRL(a.balanceCents),
              a.archived ? 'sim' : 'não',
            ]),
          ),
        );
      }

      case 'cartoes': {
        const rows = await db.creditCard.findMany({
          where: { userId },
          orderBy: { nickname: 'asc' },
        });
        return file(
          'cartoes',
          toCsv(
            ['Apelido', 'Bandeira', 'Final', 'Centavos', 'Limite', 'Fechamento', 'Vencimento'],
            rows.map((c) => [
              c.nickname,
              c.brand ?? '',
              c.last4 ?? '',
              c.limitCents,
              formatBRL(c.limitCents),
              c.closingDay,
              c.dueDay,
            ]),
          ),
        );
      }

      case 'faturas': {
        const rows = await db.invoice.findMany({
          where: { userId },
          orderBy: { dueDate: 'desc' },
          include: { creditCard: { select: { nickname: true } } },
        });
        return file(
          'faturas',
          toCsv(
            ['Cartão', 'Mês', 'Fechamento', 'Vencimento', 'Status', 'Centavos pagos', 'Pago'],
            rows.map((i) => [
              i.creditCard.nickname,
              i.referenceMonth,
              formatInSaoPaulo(i.closingDate),
              formatInSaoPaulo(i.dueDate),
              i.status,
              i.paidCents,
              formatBRL(i.paidCents),
            ]),
          ),
        );
      }

      case 'categorias': {
        const rows = await db.category.findMany({
          where: { OR: [{ userId }, { userId: null }] },
          orderBy: { name: 'asc' },
          include: { parent: { select: { name: true } } },
        });
        return file(
          'categorias',
          toCsv(
            ['Nome', 'Tipo', 'Categoria pai', 'Cor', 'Ícone'],
            rows.map((c) => [c.name, c.kind, c.parent?.name ?? '', c.color ?? '', c.icon ?? '']),
          ),
        );
      }

      case 'orcamentos': {
        const rows = await db.budget.findMany({
          where: { userId },
          orderBy: [{ month: 'desc' }],
          include: { category: { select: { name: true } } },
        });
        return file(
          'orcamentos',
          toCsv(
            ['Mês', 'Categoria', 'Centavos', 'Limite'],
            rows.map((b) => [b.month, b.category.name, b.limitCents, formatBRL(b.limitCents)]),
          ),
        );
      }

      case 'metas': {
        const rows = await db.goal.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          include: { linkedAccount: { select: { name: true, balanceCents: true } } },
        });
        return file(
          'metas',
          toCsv(
            ['Meta', 'Alvo em centavos', 'Alvo', 'Conta vinculada', 'Saldo atual', 'Prazo'],
            rows.map((g) => [
              g.name,
              g.targetCents,
              formatBRL(g.targetCents),
              g.linkedAccount.name,
              formatBRL(g.linkedAccount.balanceCents),
              g.deadline ? formatInSaoPaulo(g.deadline) : '',
            ]),
          ),
        );
      }

      case 'recorrencias': {
        const rows = await db.recurringRule.findMany({
          where: { userId },
          orderBy: { createdAt: 'asc' },
          include: { category: { select: { name: true } } },
        });
        return file(
          'recorrencias',
          toCsv(
            ['Descrição', 'Frequência', 'Centavos', 'Valor', 'Categoria', 'Início', 'Fim', 'Ativa'],
            rows.map((r) => [
              r.description,
              r.frequency,
              r.amountCents,
              formatBRL(r.amountCents),
              r.category?.name ?? '',
              formatInSaoPaulo(r.startDate),
              r.endDate ? formatInSaoPaulo(r.endDate) : '',
              r.active ? 'sim' : 'não',
            ]),
          ),
        );
      }

      case 'investimentos': {
        const rows = await db.investment.findMany({
          where: { userId },
          orderBy: { ticker: 'asc' },
        });
        return file(
          'investimentos',
          toCsv(
            [
              'Ticker',
              'Nome',
              'Classe',
              'Quantidade',
              'Investido em centavos',
              'Investido',
              'Preço médio',
              'Cotação',
              'Lucro realizado',
            ],
            rows.map((i) => [
              i.ticker,
              i.name ?? '',
              i.class,
              formatQuantity(i.quantity),
              i.investedCents,
              formatBRL(i.investedCents),
              formatBRL(i.avgPriceCents),
              formatBRL(i.currentPriceCents),
              formatBRL(i.realizedGainCents),
            ]),
          ),
        );
      }

      case 'operacoes': {
        const rows = await db.investmentTransaction.findMany({
          where: { investment: { userId } },
          orderBy: { date: 'desc' },
          include: {
            investment: { select: { ticker: true } },
            account: { select: { name: true } },
          },
        });
        return file(
          'operacoes',
          toCsv(
            ['Data', 'Ativo', 'Tipo', 'Quantidade', 'Preço', 'Taxas', 'Centavos', 'Total', 'Conta'],
            rows.map((t) => [
              formatInSaoPaulo(t.date),
              t.investment.ticker,
              t.type,
              formatQuantity(t.quantity),
              formatBRL(t.priceCents),
              formatBRL(t.feesCents),
              t.totalCents,
              formatBRL(t.totalCents),
              t.account?.name ?? '',
            ]),
          ),
        );
      }
    }
  }

  // ─── Restauração ────────────────────────────────────────────────────────────

  /**
   * Valida o arquivo ANTES de enfileirar. Se for lixo, o erro aparece na hora,
   * em vez de virar job que falha em silêncio.
   */
  async enqueueRestore(userId: string, input: RestoreBackupInput) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.content);
    } catch {
      throw new BadRequestException('O arquivo não é um JSON válido.');
    }

    const check = checkBackupFile(parsed);
    if (!check.ok) {
      throw new BadRequestException(check.problems.join(' '));
    }

    const job = await this.prisma.client.restoreJob.create({
      data: {
        userId,
        mode: input.mode,
        totalRecords: check.totalRecords,
        content: input.content,
      },
      select: { id: true, status: true, mode: true, totalRecords: true, createdAt: true },
    });

    try {
      await this.queue.send<RestoreJobData>(RESTORE_QUEUE, { jobId: job.id });
    } catch (err) {
      await this.prisma.client.restoreJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', error: `Fila indisponível: ${(err as Error).message}`, content: null },
      });
      throw new BadRequestException('A fila não está disponível; a restauração não foi iniciada.');
    }

    return { job, check: { counts: check.counts, unknownModels: check.unknownModels } };
  }

  async restoreStatus(userId: string, jobId: string) {
    const job = await this.prisma.client.restoreJob.findFirst({
      where: { id: jobId, userId },
      // `content` fica de fora: é o arquivo inteiro, não tem por que trafegar.
      select: {
        id: true,
        status: true,
        mode: true,
        progress: true,
        totalRecords: true,
        restored: true,
        error: true,
        createdAt: true,
        finishedAt: true,
      },
    });
    if (!job) throw new NotFoundException('Restauração não encontrada');
    return job;
  }

  // ─── Zona de risco ──────────────────────────────────────────────────────────

  /**
   * Nível 1: apaga movimento, fatura, importação e carteira; mantém conta,
   * cartão, categoria, tag e a configuração (orçamento, meta, recorrência).
   *
   * O saldo das contas volta a zero junto: sem lançamento nenhum, um saldo
   * remanescente seria um número sem história por trás.
   */
  async wipeMovements(userId: string, confirm: string) {
    if (confirm.trim().toUpperCase() !== WIPE_CONFIRMATION) {
      throw new BadRequestException(`Digite "${WIPE_CONFIRMATION}" para confirmar.`);
    }

    const deleted = await this.prisma.client.$transaction(
      async (tx) => {
        const counts: Record<string, number> = {};
        for (const model of MOVEMENT_MODELS) {
          const result = await delegate(tx as unknown as PrismaClient, model).deleteMany({
            where: ownerWhere(model, userId, 'delete'),
          });
          if (result.count > 0) counts[model] = result.count;
        }
        await tx.account.updateMany({ where: { userId }, data: { balanceCents: 0n } });
        return counts;
      },
      { timeout: 120_000 },
    );

    this.logger.warn(`Zona de risco: lançamentos apagados (${JSON.stringify(deleted)})`);
    return { deleted };
  }

  /** Nível 2: apaga tudo do domínio e a própria conta de acesso. Sem volta. */
  async deleteAccount(userId: string, confirm: string) {
    if (confirm.trim().toUpperCase() !== DELETE_ACCOUNT_CONFIRMATION) {
      throw new BadRequestException(`Digite "${DELETE_ACCOUNT_CONFIRMATION}" para confirmar.`);
    }

    await this.prisma.client.$transaction(
      async (tx) => {
        for (const model of fullWipeOrder()) {
          await delegate(tx as unknown as PrismaClient, model).deleteMany({
            where: ownerWhere(model, userId, 'delete'),
          });
        }
        await tx.restoreJob.deleteMany({ where: { userId } });
        // Sessão, credencial e 2FA caem por cascade ao apagar o usuário.
        await tx.user.delete({ where: { id: userId } });
      },
      { timeout: 120_000 },
    );

    this.logger.warn('Zona de risco: conta excluída a pedido do dono.');
    return { ok: true };
  }
}

/** Quantidade é inteiro na escala 1e-8; no CSV vai legível, com 8 casas. */
function formatQuantity(scaled: bigint): string {
  const negative = scaled < 0n;
  const abs = negative ? -scaled : scaled;
  const inteiro = abs / 100_000_000n;
  const fracao = (abs % 100_000_000n).toString().padStart(8, '0').replace(/0+$/, '') || '0';
  return `${negative ? '-' : ''}${inteiro},${fracao}`;
}
