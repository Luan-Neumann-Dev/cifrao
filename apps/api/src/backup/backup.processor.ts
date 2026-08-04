import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@cifrao/db';
import {
  BACKUP_MODELS,
  backupFileSchema,
  fullWipeOrder,
  sortByParent,
  splitSelfReference,
} from '@cifrao/shared';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { RESTORE_QUEUE, type RestoreJobData } from './backup.service';
import { reviveRow } from './model-fields';

/** Lotes do createMany: grande o bastante para ser rápido, pequeno para caber. */
const CHUNK = 500;

/** Uma restauração completa não pode estourar o timeout padrão de 5s do Prisma. */
const TRANSACTION_TIMEOUT_MS = 5 * 60 * 1000;

type AnyDelegate = {
  createMany: (args: { data: unknown[]; skipDuplicates?: boolean }) => Promise<{ count: number }>;
  deleteMany: (args?: unknown) => Promise<{ count: number }>;
  update: (args: unknown) => Promise<unknown>;
};

function delegate(db: Prisma.TransactionClient, model: string): AnyDelegate {
  const found = (db as unknown as Record<string, AnyDelegate>)[model];
  if (!found) throw new Error(`Delegate não encontrado: ${model}`);
  return found;
}

/**
 * Restauração de backup em job do pg-boss (Fase 9).
 *
 * Roda inteira dentro de uma transação: ou o banco fica exatamente como o
 * arquivo descreve, ou nada muda. Meio caminho aqui seria pior que não
 * restaurar — deixaria lançamento sem conta e fatura sem cartão.
 *
 * A ordem de gravação vem de `BACKUP_MODELS` (pai antes de filho) e os dois
 * vínculos que apontam para a própria tabela — subcategoria e estorno da regra
 * 5.13 — são gravados num segundo passe, depois que todas as linhas existem.
 */
@Injectable()
export class BackupProcessor implements OnModuleInit {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.queue.work<RestoreJobData>(RESTORE_QUEUE, (data) => this.restore(data.jobId));
    } catch (err) {
      this.logger.error(`Worker de restauração indisponível: ${(err as Error).message}`);
    }
  }

  async restore(jobId: string): Promise<void> {
    const db = this.prisma.client;
    const job = await db.restoreJob.findUnique({ where: { id: jobId } });
    if (!job || !job.content) {
      this.logger.error(`Restauração ${jobId} sem conteúdo — nada a fazer.`);
      return;
    }

    await db.restoreJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', progress: 0, error: null },
    });

    try {
      const file = backupFileSchema.parse(JSON.parse(job.content));
      const replace = job.mode === 'replace';
      const restored: Record<string, number> = {};

      await db.$transaction(
        async (tx) => {
          if (replace) {
            for (const model of fullWipeOrder()) {
              await delegate(tx, model).deleteMany({});
            }
          }

          let done = 0;
          const total = Math.max(1, job.totalRecords);

          for (const spec of BACKUP_MODELS) {
            const raw = file.data[spec.model];
            if (!Array.isArray(raw) || raw.length === 0) continue;

            // Só colunas que este schema conhece, com BigInt e Date de volta.
            let rows = raw.map((row) => reviveRow(spec.model, row));

            // Categoria aponta para categoria: pai precisa existir antes.
            if (spec.model === 'category') {
              rows = sortByParent(rows, 'id', 'parentId');
            }

            let links: { id: string; value: string }[] = [];
            if (spec.selfReference) {
              const split = splitSelfReference(rows, spec.selfReference, 'id');
              rows = split.rows;
              links = split.links;
            }

            for (let offset = 0; offset < rows.length; offset += CHUNK) {
              const slice = rows.slice(offset, offset + CHUNK);
              await delegate(tx, spec.model).createMany({ data: slice, skipDuplicates: true });
              done += slice.length;
              await tx.restoreJob.update({
                where: { id: jobId },
                data: { progress: Math.min(99, Math.round((done / total) * 100)) },
              });
            }

            // Segundo passe: agora que todas as linhas existem, liga a auto-referência.
            for (const link of links) {
              await delegate(tx, spec.model).update({
                where: { id: link.id },
                data: { [spec.selfReference as string]: link.value },
              });
            }

            restored[spec.model] = rows.length;
          }

          // Preferências do dono voltam junto; identidade e senha, nunca.
          if (file.profile) {
            const { name, theme, accentColor, ...notify } = file.profile;
            await tx.user.updateMany({
              data: {
                ...(name ? { name } : {}),
                ...(theme !== undefined ? { theme } : {}),
                ...(accentColor !== undefined ? { accentColor } : {}),
                ...notify,
              },
            });
          }
        },
        { timeout: TRANSACTION_TIMEOUT_MS, maxWait: 30_000 },
      );

      await db.restoreJob.update({
        where: { id: jobId },
        data: {
          status: 'DONE',
          progress: 100,
          restored,
          finishedAt: new Date(),
          // O arquivo some assim que termina: não há storage nesta fase.
          content: null,
        },
      });
      this.logger.log(`Restauração ${jobId} concluída: ${JSON.stringify(restored)}`);
    } catch (err) {
      const message = (err as Error).message;
      await db.restoreJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: message, finishedAt: new Date(), content: null },
      });
      this.logger.error(`Restauração ${jobId} falhou: ${message}`);
    }
  }
}

/** Exportado só para o teste conseguir montar um client falso. */
export type { PrismaClient };
