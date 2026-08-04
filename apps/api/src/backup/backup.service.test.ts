import { BadRequestException } from '@nestjs/common';
import {
  BACKUP_APP,
  BACKUP_VERSION,
  DELETE_ACCOUNT_CONFIRMATION,
  WIPE_CONFIRMATION,
} from '@cifrao/shared';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { BackupService } from './backup.service';
import { modelFields, reviveRow } from './model-fields';

/**
 * Zona de risco e restauração (Fase 9). O que precisa estar provado é que nada
 * destrutivo acontece sem a frase exata, que "apagar lançamentos" preserva o que
 * foi prometido, e que o arquivo enviado é validado antes de virar job.
 */

const MODELOS_APAGADOS = new Set([
  'importRow',
  'importBatch',
  'transactionTag',
  'transactionSplit',
  'transaction',
  'purchase',
  'invoice',
  'priceHistory',
  'investmentTransaction',
  'investment',
]);

function makeService() {
  const deleted: string[] = [];
  const delegate = (model: string) => ({
    deleteMany: vi.fn(async () => {
      deleted.push(model);
      return { count: 1 };
    }),
    findMany: vi.fn(async () => []),
    count: vi.fn(async () => 0),
  });

  const models = [
    'category',
    'account',
    'tag',
    'creditCard',
    'invoice',
    'purchase',
    'recurringRule',
    'investment',
    'transaction',
    'transactionSplit',
    'transactionTag',
    'budget',
    'goal',
    'categoryRule',
    'investmentTransaction',
    'priceHistory',
    'allocationTarget',
    'importBatch',
    'importRow',
    'restoreJob',
  ];

  const tx: Record<string, unknown> = {};
  for (const model of models) tx[model] = delegate(model);
  (tx.account as Record<string, unknown>).updateMany = vi.fn(async () => ({ count: 3 }));
  (tx.user as unknown) = { delete: vi.fn(async () => ({})) };

  const client = {
    ...tx,
    restoreJob: {
      ...(tx.restoreJob as object),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => ({
        id: 'job-1',
        ...args.data,
      })),
      update: vi.fn(async () => ({})),
      findUnique: vi.fn(async () => null),
    },
    $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx)),
  };

  const queue = { send: vi.fn(async () => 'job-id') } as unknown as QueueService;
  const service = new BackupService({ client } as unknown as PrismaService, queue);
  return { service, client, tx, deleted, queue };
}

function backupFile(data: Record<string, unknown[]>) {
  return JSON.stringify({
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: '2026-08-04T12:00:00.000Z',
    data,
  });
}

describe('zona de risco — apagar lançamentos', () => {
  it('exige a frase exata', async () => {
    const { service } = makeService();
    await expect(service.wipeMovements('apagar')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.wipeMovements('')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('aceita a frase com espaço e caixa diferente', async () => {
    const { service } = makeService();
    await expect(service.wipeMovements(`  ${WIPE_CONFIRMATION.toLowerCase()}  `)).resolves.toBeDefined();
  });

  it('apaga movimento, fatura, importação e carteira', async () => {
    const { service, deleted } = makeService();
    await service.wipeMovements(WIPE_CONFIRMATION);
    for (const model of MODELOS_APAGADOS) {
      expect(deleted, `${model} deveria ser apagado`).toContain(model);
    }
  });

  it('NÃO apaga conta, cartão, categoria, tag nem a configuração', async () => {
    const { service, deleted } = makeService();
    await service.wipeMovements(WIPE_CONFIRMATION);
    for (const model of ['account', 'creditCard', 'category', 'tag', 'budget', 'goal', 'recurringRule', 'categoryRule']) {
      expect(deleted, `${model} deveria sobreviver`).not.toContain(model);
    }
  });

  it('zera o saldo das contas — saldo sem lançamento seria número sem história', async () => {
    const { service, tx } = makeService();
    await service.wipeMovements(WIPE_CONFIRMATION);
    expect((tx.account as { updateMany: ReturnType<typeof vi.fn> }).updateMany).toHaveBeenCalledWith({
      data: { balanceCents: 0n },
    });
  });

  it('apaga o filho antes do pai (FK não perdoa)', async () => {
    const { service, deleted } = makeService();
    await service.wipeMovements(WIPE_CONFIRMATION);
    expect(deleted.indexOf('transactionSplit')).toBeLessThan(deleted.indexOf('transaction'));
    expect(deleted.indexOf('transaction')).toBeLessThan(deleted.indexOf('invoice'));
    expect(deleted.indexOf('importRow')).toBeLessThan(deleted.indexOf('importBatch'));
  });

  it('roda numa transação só', async () => {
    const { service, client } = makeService();
    await service.wipeMovements(WIPE_CONFIRMATION);
    expect(client.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('zona de risco — excluir conta', () => {
  it('exige a frase exata, diferente da de apagar lançamentos', async () => {
    const { service } = makeService();
    expect(DELETE_ACCOUNT_CONFIRMATION).not.toBe(WIPE_CONFIRMATION);
    await expect(service.deleteAccount('u1', WIPE_CONFIRMATION)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('apaga o domínio inteiro e por último o usuário', async () => {
    const { service, deleted, tx } = makeService();
    await service.deleteAccount('u1', DELETE_ACCOUNT_CONFIRMATION);
    expect(deleted).toContain('account');
    expect(deleted).toContain('category');
    expect(deleted).toContain('transaction');
    expect((tx.user as { delete: ReturnType<typeof vi.fn> }).delete).toHaveBeenCalledWith({
      where: { id: 'u1' },
    });
  });
});

describe('enfileirar restauração', () => {
  it('recusa arquivo que não é JSON', async () => {
    const { service } = makeService();
    await expect(
      service.enqueueRestore({ content: 'isso não é json', mode: 'replace' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa JSON que não é backup do Cifrão', async () => {
    const { service } = makeService();
    await expect(
      service.enqueueRestore({ content: JSON.stringify({ oi: 1 }), mode: 'replace' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('recusa backup de versão futura em vez de gravar errado', async () => {
    const { service } = makeService();
    const futuro = JSON.stringify({
      app: BACKUP_APP,
      version: BACKUP_VERSION + 1,
      exportedAt: 'x',
      data: { account: [{ id: 'a' }] },
    });
    await expect(service.enqueueRestore({ content: futuro, mode: 'replace' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('guarda o arquivo no job e enfileira (armadilha #3: não roda no request)', async () => {
    const { service, client, queue } = makeService();
    const content = backupFile({ account: [{ id: 'a1' }], transaction: [{ id: 't1' }] });

    const result = await service.enqueueRestore({ content, mode: 'replace' });

    expect(client.restoreJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mode: 'replace', totalRecords: 2 }) }),
    );
    expect(queue.send).toHaveBeenCalledWith('backup-restore', { jobId: 'job-1' });
    expect(result.check.counts.map((c) => c.model)).toEqual(['account', 'transaction']);
  });

  it('marca o job como falho se a fila estiver fora do ar', async () => {
    const { client } = makeService();
    const queueQuebrada = {
      send: vi.fn(async () => {
        throw new Error('sem fila');
      }),
    } as unknown as QueueService;
    const quebrado = new BackupService({ client } as unknown as PrismaService, queueQuebrada);

    await expect(
      quebrado.enqueueRestore({ content: backupFile({ account: [{ id: 'a' }] }), mode: 'replace' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(client.restoreJob.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED', content: null }) }),
    );
  });
});

describe('tipos das colunas lidos do schema (DMMF)', () => {
  it('reconhece o dinheiro como BigInt em vez de depender de lista escrita à mão', () => {
    expect(modelFields('transaction').bigint.has('amountCents')).toBe(true);
    expect(modelFields('account').bigint.has('balanceCents')).toBe(true);
    expect(modelFields('investment').bigint.has('investedCents')).toBe(true);
    expect(modelFields('investment').bigint.has('quantity')).toBe(true);
  });

  it('reconhece as datas', () => {
    expect(modelFields('transaction').date.has('date')).toBe(true);
    expect(modelFields('invoice').date.has('dueDate')).toBe(true);
  });

  it('devolve centavo como BigInt e data como Date (regras 5.1 e 5.2)', () => {
    const row = reviveRow('transaction', {
      id: 't1',
      amountCents: '12345',
      date: '2026-08-04T03:00:00.000Z',
      description: 'Mercado',
    });
    expect(row.amountCents).toBe(12345n);
    expect(row.date).toBeInstanceOf(Date);
    expect((row.date as Date).toISOString()).toBe('2026-08-04T03:00:00.000Z');
  });

  it('ignora coluna que este schema não conhece (backup mais novo)', () => {
    const row = reviveRow('account', { id: 'a1', name: 'Conta', campoDoFuturo: 42 });
    expect(row).not.toHaveProperty('campoDoFuturo');
    expect(row.name).toBe('Conta');
  });

  it('recusa valor que não é inteiro em centavos em vez de gravar float', () => {
    expect(() => reviveRow('transaction', { amountCents: '12,34' })).toThrow(/centavos/);
    expect(() => reviveRow('transaction', { amountCents: 1.5 })).toThrow(/centavos/);
  });

  it('recusa data inválida', () => {
    expect(() => reviveRow('transaction', { date: 'ontem' })).toThrow(/data válida/);
  });

  it('preserva null sem transformar em zero', () => {
    const row = reviveRow('transaction', { amountCents: null, date: null });
    expect(row.amountCents).toBeNull();
    expect(row.date).toBeNull();
  });
});
