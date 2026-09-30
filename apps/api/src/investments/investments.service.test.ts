import { toQuantity } from '@cifrao/shared';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { InvestmentsService } from './investments.service';

/** Dono fixo dos testes: todo service agora recebe o userId. */
const USER = 'user-1';

/**
 * Fase 8, risco central: o mesmo real não pode existir na conta E na carteira.
 * Aqui se prova que aportar debita a conta, que o movimento é TRANSFER (nunca
 * despesa — regra 5.7) e que desfazer devolve o dinheiro.
 */
function makePrisma(investment: Record<string, unknown>) {
  const state = { ...investment };
  const balanceOps: { id: string; increment: bigint }[] = [];
  const created: Record<string, unknown>[] = [];
  const trades: Record<string, unknown>[] = [];

  const client = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
    investment: {
      findFirst: vi.fn(async () => ({ ...state })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(state, data);
        return state;
      }),
    },
    investmentTransaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `trade-${trades.length + 1}`, ...data };
        trades.push(row);
        return row;
      }),
      findMany: vi.fn(async () => trades),
      findFirst: vi.fn(async () => trades[0] ?? null),
      delete: vi.fn(async () => ({})),
    },
    transaction: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `tx-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
      findFirst: vi.fn(async () => created[0] ?? null),
      delete: vi.fn(async () => ({})),
    },
    account: {
      findFirst: vi.fn(async () => ({ id: 'acc-1', balanceCents: 1_000_000n })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { balanceCents: { increment: bigint } } }) => {
        balanceOps.push({ id: where.id, increment: data.balanceCents.increment });
        return {};
      }),
    },
  };

  return {
    service: new InvestmentsService({ client } as unknown as PrismaService),
    state,
    balanceOps,
    created,
    trades,
  };
}

const posicao = {
  id: 'inv-1',
  ticker: 'PETR4',
  quantity: 0n,
  investedCents: 0n,
  avgPriceCents: 0n,
  currentPriceCents: 0n,
  realizedGainCents: 0n,
};

const aporte = {
  quantity: '10',
  priceCents: 2000,
  feesCents: 0,
  date: new Date('2026-03-10T12:00:00Z'),
};

describe('InvestmentsService — dinheiro não é contado duas vezes', () => {
  it('aporte com conta debita exatamente o valor pago', async () => {
    const { service, balanceOps } = makePrisma(posicao);

    await service.contribute(USER, 'inv-1', { ...aporte, accountId: 'acc-1' });

    // 10 × R$ 20,00 = R$ 200,00 saem da conta.
    expect(balanceOps).toEqual([{ id: 'acc-1', increment: -20_000n }]);
  });

  it('o movimento é TRANSFER, nunca despesa (regra 5.7)', async () => {
    const { service, created } = makePrisma(posicao);

    await service.contribute(USER, 'inv-1', { ...aporte, accountId: 'acc-1' });

    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('TRANSFER');
    expect(created[0].fromAccountId).toBe('acc-1');
    expect(created[0].toAccountId).toBeNull();
    expect(created[0].description).toContain('PETR4');
  });

  it('taxas entram no que sai da conta', async () => {
    const { service, balanceOps } = makePrisma(posicao);
    await service.contribute(USER, 'inv-1', { ...aporte, feesCents: 500, accountId: 'acc-1' });
    expect(balanceOps[0].increment).toBe(-20_500n);
  });

  it('aporte sem conta não mexe em saldo nenhum', async () => {
    const { service, balanceOps, created } = makePrisma(posicao);

    await service.contribute(USER, 'inv-1', { ...aporte, accountId: null });

    expect(balanceOps).toEqual([]);
    expect(created).toEqual([]);
  });

  it('a posição fica com o preço médio calculado', async () => {
    const { service, state } = makePrisma(posicao);
    await service.contribute(USER, 'inv-1', { ...aporte, accountId: null });
    expect(state.quantity).toBe(toQuantity('10'));
    expect(state.investedCents).toBe(20_000n);
    expect(state.avgPriceCents).toBe(2000n);
  });

  it('resgate credita a conta e o movimento entra por toAccountId', async () => {
    const { service, balanceOps, created } = makePrisma({
      ...posicao,
      quantity: toQuantity('10'),
      investedCents: 20_000n,
      avgPriceCents: 2000n,
    });

    await service.redeem(USER, 'inv-1', {
      quantity: '4',
      priceCents: 3000,
      feesCents: 0,
      date: new Date('2026-04-01T12:00:00Z'),
      accountId: 'acc-1',
    });

    expect(balanceOps).toEqual([{ id: 'acc-1', increment: 12_000n }]);
    expect(created[0].type).toBe('TRANSFER');
    expect(created[0].toAccountId).toBe('acc-1');
    expect(created[0].fromAccountId).toBeNull();
  });

  it('resgate registra o lucro realizado na posição', async () => {
    const { service, state } = makePrisma({
      ...posicao,
      quantity: toQuantity('10'),
      investedCents: 20_000n,
      avgPriceCents: 2000n,
    });

    await service.redeem(USER, 'inv-1', {
      quantity: '4',
      priceCents: 3000,
      feesCents: 0,
      date: new Date('2026-04-01T12:00:00Z'),
      accountId: null,
    });

    expect(state.realizedGainCents).toBe(4_000n);
    expect(state.avgPriceCents).toBe(2000n); // venda não muda o preço médio
  });

  it('recusa resgate maior que a carteira com mensagem clara', async () => {
    const { service } = makePrisma({
      ...posicao,
      quantity: toQuantity('2'),
      investedCents: 4_000n,
    });

    await expect(
      service.redeem(USER, 'inv-1', {
        quantity: '5',
        priceCents: 3000,
        feesCents: 0,
        date: new Date(),
        accountId: null,
      }),
    ).rejects.toThrow(/maior que a quantidade/i);
  });

  it('recusa quantidade inválida', async () => {
    const { service } = makePrisma(posicao);
    await expect(
      service.contribute(USER, 'inv-1', { ...aporte, quantity: 'abc', accountId: null }),
    ).rejects.toThrow(/inválida/i);
  });

  it('desfazer a operação devolve o dinheiro para a conta', async () => {
    const { service, balanceOps } = makePrisma(posicao);
    await service.contribute(USER, 'inv-1', { ...aporte, accountId: 'acc-1' });
    balanceOps.length = 0;

    await service.removeTrade(USER, 'inv-1', 'trade-1');

    // O débito do aporte volta como crédito.
    expect(balanceOps).toEqual([{ id: 'acc-1', increment: 20_000n }]);
  });
});
