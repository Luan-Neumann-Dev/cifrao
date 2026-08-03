import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { GoalsService } from './goals.service';

/**
 * Aceite da Fase 5: "meta nunca cria saldo novo". O fake abaixo grita se o
 * serviço tentar criar/alterar lançamento ou mexer em saldo de conta (regra 5.9).
 */
function makePrisma(options: {
  goals: Record<string, unknown>[];
  groupBy?: Record<string, unknown>[][];
}) {
  const proibido = (nome: string) => () => {
    throw new Error(`meta não pode ${nome}`);
  };
  const groupByQueue = [...(options.groupBy ?? [[], [], []])];

  const client = {
    goal: {
      findMany: vi.fn(async () => options.goals),
      findUnique: vi.fn(async () => options.goals[0] ?? null),
      create: vi.fn(async (args: { data: Record<string, unknown> }) => args.data),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => args.data),
      delete: vi.fn(async () => ({})),
    },
    account: {
      findUnique: vi.fn(async () => ({ id: 'acc-1', balanceCents: 250_000n })),
      // Qualquer escrita em conta é violação da regra 5.9.
      update: vi.fn(proibido('atualizar saldo de conta')),
      updateMany: vi.fn(proibido('atualizar saldo de conta')),
    },
    transaction: {
      groupBy: vi.fn(async () => groupByQueue.shift() ?? []),
      create: vi.fn(proibido('criar lançamento')),
      createMany: vi.fn(proibido('criar lançamento')),
      update: vi.fn(proibido('alterar lançamento')),
      delete: vi.fn(proibido('excluir lançamento')),
    },
  };
  return { service: new GoalsService({ client } as unknown as PrismaService), client };
}

const meta = {
  id: 'goal-1',
  name: 'Reserva de emergência',
  targetCents: 1_000_000n,
  deadline: null,
  archived: false,
  monthlyContributionCents: null,
  linkedAccountId: 'acc-1',
  linkedAccount: {
    id: 'acc-1',
    name: 'Poupança',
    type: 'SAVINGS',
    color: null,
    balanceCents: 250_000n,
  },
  createdAt: new Date('2026-01-01T00:00:00Z'),
};

describe('GoalsService (regra 5.9)', () => {
  it('aceite: lê o progresso do saldo vinculado e não cria saldo novo', async () => {
    const { service, client } = makePrisma({ goals: [meta] });
    const [out] = await service.list();

    expect(out.currentCents).toBe(250_000n); // exatamente o saldo da conta
    expect(out.targetCents).toBe(1_000_000n);
    expect(out.percent).toBe(25);
    expect(out.remainingCents).toBe(750_000n);

    // Nenhuma escrita em conta ou lançamento: a meta não move dinheiro.
    expect(client.account.update).not.toHaveBeenCalled();
    expect(client.transaction.create).not.toHaveBeenCalled();
    expect(client.transaction.createMany).not.toHaveBeenCalled();
  });

  it('criar, editar e excluir meta não tocam em saldo nem em lançamento', async () => {
    const { service, client } = makePrisma({ goals: [meta] });

    await service.create({
      name: 'Viagem',
      targetCents: 500_000,
      linkedAccountId: 'acc-1',
      deadline: null,
      monthlyContributionCents: 50_000,
    });
    await service.update('goal-1', { targetCents: 800_000 });
    await service.remove('goal-1');

    expect(client.account.update).not.toHaveBeenCalled();
    expect(client.account.updateMany).not.toHaveBeenCalled();
    expect(client.transaction.create).not.toHaveBeenCalled();
    expect(client.transaction.delete).not.toHaveBeenCalled();
  });

  it('ETA usa o ritmo histórico do saldo vinculado (3 meses)', async () => {
    // 3 meses: +900.000 de receita e −300.000 de despesa => ritmo 200.000/mês.
    const { service } = makePrisma({
      goals: [meta],
      groupBy: [
        [
          { accountId: 'acc-1', type: 'INCOME', _sum: { amountCents: 900_000n } },
          { accountId: 'acc-1', type: 'EXPENSE', _sum: { amountCents: 300_000n } },
        ],
        [],
        [],
      ],
    });

    const [out] = await service.list();
    expect(out.paceSource).toBe('history');
    expect(out.paceCents).toBe(200_000n);
    expect(out.etaMonths).toBe(4); // faltam 750.000 => 3,75 => 4 meses
    expect(out.etaMonth).not.toBeNull();
  });

  it('sem histórico, cai para o aporte declarado', async () => {
    const { service } = makePrisma({
      goals: [{ ...meta, monthlyContributionCents: 150_000n }],
    });
    const [out] = await service.list();
    expect(out.paceSource).toBe('contribution');
    expect(out.etaMonths).toBe(5); // 750.000 / 150.000
  });

  it('transferência recebida conta no ritmo (entra saldo na conta vinculada)', async () => {
    const { service } = makePrisma({
      goals: [meta],
      groupBy: [[], [], [{ toAccountId: 'acc-1', _sum: { amountCents: 600_000n } }]],
    });
    const [out] = await service.list();
    expect(out.paceCents).toBe(200_000n);
    expect(out.paceSource).toBe('history');
  });
});
