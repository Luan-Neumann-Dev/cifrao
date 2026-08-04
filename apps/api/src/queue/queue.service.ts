import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
// `import type` é apagado na compilação: o pg-boss é ESM e entra em runtime
// pelo `importEsm` (ver common/esm.ts).
import type { Job, PgBoss } from 'pg-boss';
import { importEsm } from '../common/esm';

type PgBossModule = typeof import('pg-boss');

/**
 * Fila do Cifrão — pg-boss rodando no próprio Postgres (stack da Seção 2, sem
 * Redis). Regra 5.12: importação, dedupe e confirmação rodam em job, nunca no
 * request HTTP.
 *
 * A conexão usa `DIRECT_URL` de propósito: o pg-boss mantém conexão própria e
 * depende de LISTEN/NOTIFY, que o pooler em modo transação atrapalha
 * (armadilha #1).
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private boss: PgBoss | null = null;
  private starting: Promise<PgBoss> | null = null;

  async onModuleInit(): Promise<void> {
    try {
      await this.instance();
    } catch (err) {
      // A API sobe mesmo sem fila: só a importação fica indisponível, com
      // mensagem clara, em vez de derrubar o app inteiro.
      this.logger.error(`Fila indisponível: ${(err as Error).message}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.boss) {
      await this.boss.stop({ graceful: true });
      this.boss = null;
    }
  }

  private connectionString(): string {
    const url =
      process.env.PGBOSS_DATABASE_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
    if (!url) throw new Error('Sem DATABASE_URL/DIRECT_URL para a fila.');
    return url;
  }

  /** Sobe o pg-boss uma única vez, mesmo com chamadas concorrentes. */
  private async instance(): Promise<PgBoss> {
    if (this.boss) return this.boss;

    this.starting ??= (async () => {
      const { PgBoss: PgBossCtor } = await importEsm<PgBossModule>('pg-boss');
      const boss = new PgBossCtor({
        connectionString: this.connectionString(),
        schema: process.env.PGBOSS_SCHEMA ?? 'pgboss',
        max: 3,
      });
      boss.on('error', (err: Error) => this.logger.error(`pg-boss: ${err.message}`));
      await boss.start();
      this.boss = boss;
      this.logger.log('Fila pronta (pg-boss)');
      return boss;
    })();

    try {
      return await this.starting;
    } catch (err) {
      this.starting = null;
      throw err;
    }
  }

  /** Registra um worker. Cria a fila se ainda não existir (pg-boss v10+). */
  async work<T extends object>(queue: string, handler: (data: T) => Promise<void>): Promise<void> {
    const boss = await this.instance();
    await boss.createQueue(queue);
    await boss.work<T>(queue, { batchSize: 1 }, async (jobs: Job<T>[]) => {
      for (const job of jobs) {
        await handler(job.data);
      }
    });
    this.logger.log(`Worker ativo: ${queue}`);
  }

  /** Enfileira um job. Estoura com mensagem clara se a fila não subiu. */
  async send<T extends object>(queue: string, data: T): Promise<string | null> {
    const boss = await this.instance();
    await boss.createQueue(queue);
    return boss.send(queue, data);
  }
}
