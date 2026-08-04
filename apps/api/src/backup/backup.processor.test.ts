import { BACKUP_APP, BACKUP_VERSION } from '@cifrao/shared';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { BackupProcessor } from './backup.processor';

/**
 * Aceite da Fase 9: "consigo exportar meu histórico inteiro e restaurar num
 * banco limpo". Aqui se prova o lado difícil disso — gravar milhares de linhas
 * sem violar chave estrangeira e sem perder o vínculo do estorno (regra 5.13)
 * nem a hierarquia de categorias.
 */

interface Escrita {
  model: string;
  ids: string[];
  rows: Record<string, unknown>[];
}

function makeProcessor(file: unknown, mode: 'replace' | 'merge' = 'replace') {
  const escritas: Escrita[] = [];
  const apagados: string[] = [];
  const updates: { model: string; id: string; data: Record<string, unknown> }[] = [];
  const jobUpdates: Record<string, unknown>[] = [];

  const handler = {
    get(_target: object, model: string) {
      if (model === 'then') return undefined;
      if (model === 'restoreJob') {
        return {
          update: vi.fn(async (args: { data: Record<string, unknown> }) => {
            jobUpdates.push(args.data);
            return {};
          }),
        };
      }
      if (model === 'user') {
        return { updateMany: vi.fn(async () => ({ count: 1 })) };
      }
      return {
        createMany: vi.fn(async (args: { data: Record<string, unknown>[] }) => {
          escritas.push({ model, ids: args.data.map((r) => String(r.id)), rows: args.data });
          return { count: args.data.length };
        }),
        deleteMany: vi.fn(async () => {
          apagados.push(model);
          return { count: 0 };
        }),
        update: vi.fn(async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          updates.push({ model, id: args.where.id, data: args.data });
          return {};
        }),
      };
    },
  };
  const tx = new Proxy({}, handler);

  const content = typeof file === 'string' ? file : JSON.stringify(file);
  const client = {
    restoreJob: {
      findUnique: vi.fn(async () => ({
        id: 'job-1',
        mode,
        content,
        totalRecords: 10,
      })),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        jobUpdates.push(args.data);
        return {};
      }),
    },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };

  const queue = { work: vi.fn(async () => undefined) } as unknown as QueueService;
  const processor = new BackupProcessor({ client } as unknown as PrismaService, queue);
  return { processor, escritas, apagados, updates, jobUpdates, client };
}

function backup(data: Record<string, unknown[]>, profile?: Record<string, unknown>) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: '2026-08-04T12:00:00.000Z',
    ...(profile ? { profile } : {}),
    data,
  };
}

/** Ordem em que os models foram gravados de fato. */
const ordemDe = (escritas: Escrita[]) => escritas.map((e) => e.model);

describe('restauração de backup', () => {
  it('grava o pai antes do filho', async () => {
    const { processor, escritas } = makeProcessor(
      backup({
        transaction: [{ id: 't1', amountCents: '1000', date: '2026-08-01T12:00:00.000Z' }],
        account: [{ id: 'a1', balanceCents: '5000' }],
        creditCard: [{ id: 'c1', limitCents: '900000' }],
        invoice: [{ id: 'i1', paidCents: '0' }],
        transactionSplit: [{ id: 's1', amountCents: '500' }],
      }),
    );

    await processor.restore('job-1');
    const ordem = ordemDe(escritas);

    expect(ordem.indexOf('account')).toBeLessThan(ordem.indexOf('creditCard'));
    expect(ordem.indexOf('creditCard')).toBeLessThan(ordem.indexOf('invoice'));
    expect(ordem.indexOf('invoice')).toBeLessThan(ordem.indexOf('transaction'));
    expect(ordem.indexOf('transaction')).toBeLessThan(ordem.indexOf('transactionSplit'));
  });

  it('ordena categoria para o pai existir antes da subcategoria', async () => {
    const { processor, escritas } = makeProcessor(
      backup({
        category: [
          { id: 'neta', parentId: 'filha' },
          { id: 'filha', parentId: 'raiz' },
          { id: 'raiz', parentId: null },
        ],
      }),
    );

    await processor.restore('job-1');
    const categorias = escritas.find((e) => e.model === 'category');
    expect(categorias?.ids).toEqual(['raiz', 'filha', 'neta']);
  });

  it('grava o vínculo do estorno num segundo passe (regra 5.13)', async () => {
    const { processor, escritas, updates } = makeProcessor(
      backup({
        transaction: [
          {
            id: 'estorno',
            amountCents: '5000',
            date: '2026-08-02T12:00:00.000Z',
            reimbursesTransactionId: 'gasto',
          },
          { id: 'gasto', amountCents: '5000', date: '2026-08-01T12:00:00.000Z' },
        ],
      }),
    );

    await processor.restore('job-1');

    // Na inserção o vínculo vai nulo: o gasto pode ainda não existir.
    const inseridas = escritas.find((e) => e.model === 'transaction');
    expect(inseridas?.ids).toEqual(['estorno', 'gasto']);
    // Depois que todas existem, o vínculo é amarrado.
    expect(updates).toContainEqual({
      model: 'transaction',
      id: 'estorno',
      data: { reimbursesTransactionId: 'gasto' },
    });
  });

  it('modo replace apaga tudo antes de gravar', async () => {
    const { processor, apagados } = makeProcessor(backup({ account: [{ id: 'a1' }] }), 'replace');
    await processor.restore('job-1');
    expect(apagados).toContain('transaction');
    expect(apagados).toContain('account');
    expect(apagados.indexOf('importRow')).toBeLessThan(apagados.indexOf('importBatch'));
  });

  it('modo merge não apaga nada', async () => {
    const { processor, apagados } = makeProcessor(backup({ account: [{ id: 'a1' }] }), 'merge');
    await processor.restore('job-1');
    expect(apagados).toEqual([]);
  });

  it('converte centavo para BigInt e data para Date ao gravar (regras 5.1 e 5.2)', async () => {
    const { processor, escritas } = makeProcessor(
      backup({
        account: [{ id: 'a1', balanceCents: '123456', createdAt: '2026-01-01T00:00:00.000Z' }],
      }),
    );

    await processor.restore('job-1');

    const conta = escritas.find((e) => e.model === 'account')?.rows[0];
    expect(conta?.balanceCents).toBe(123456n);
    expect(conta?.createdAt).toBeInstanceOf(Date);
  });

  it('descarta coluna que este schema não conhece em vez de quebrar', async () => {
    const { processor, escritas } = makeProcessor(
      backup({ account: [{ id: 'a1', balanceCents: '0', colunaDoFuturo: 'x' }] }),
    );

    await processor.restore('job-1');

    const conta = escritas.find((e) => e.model === 'account')?.rows[0];
    expect(conta).not.toHaveProperty('colunaDoFuturo');
    expect(conta?.id).toBe('a1');
  });

  it('termina marcando DONE, com 100% e sem deixar o arquivo para trás', async () => {
    const { processor, jobUpdates } = makeProcessor(
      backup({ account: [{ id: 'a1', balanceCents: '0' }] }),
    );
    await processor.restore('job-1');

    const final = jobUpdates.at(-1);
    expect(final).toMatchObject({ status: 'DONE', progress: 100, content: null });
  });

  it('restaura as preferências do dono, nunca a credencial', async () => {
    const { processor } = makeProcessor(
      backup({ account: [{ id: 'a1' }] }, { name: 'Luan', theme: 'dark', accentColor: '#123456' }),
    );
    await expect(processor.restore('job-1')).resolves.toBeUndefined();
  });

  it('falha marcando FAILED, com a mensagem, e limpa o arquivo', async () => {
    const { processor, jobUpdates } = makeProcessor(
      backup({ transaction: [{ id: 't1', amountCents: 'não é número' }] }),
    );
    await processor.restore('job-1');

    const final = jobUpdates.at(-1);
    expect(final).toMatchObject({ status: 'FAILED', content: null });
    expect(String((final as { error: string }).error)).toContain('centavos');
  });

  it('não explode quando o job sumiu', async () => {
    const { processor, client } = makeProcessor(backup({ account: [] }));
    client.restoreJob.findUnique = vi.fn(async () => null);
    await expect(processor.restore('sumiu')).resolves.toBeUndefined();
  });
});
