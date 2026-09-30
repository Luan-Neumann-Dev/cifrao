import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { TransactionsService } from './transactions.service';

/** Dono fixo dos testes: todo service agora recebe o userId. */
const USER = 'user-1';

/**
 * Regra 5.13 no serviço: "marcar como recebido" cria um estorno vinculado que
 * credita a conta escolhida, herda a categoria do gasto e suporta parcial.
 */
function makePrisma(original: Record<string, unknown>) {
  const state = { ...original };
  const created: Record<string, unknown>[] = [];
  const balanceOps: { id: string; increment: bigint }[] = [];
  const updates: Record<string, unknown>[] = [];

  const client = {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(client),
    transaction: {
      findFirst: vi.fn(async () => ({ ...state, reimbursements: state.reimbursements ?? [] })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `refund-${created.length + 1}`, ...data };
        created.push(row);
        return row;
      }),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        updates.push(data);
        Object.assign(state, data);
        return state;
      }),
      findMany: vi.fn(async () => []),
      deleteMany: vi.fn(async () => ({ count: 0 })),
      delete: vi.fn(async () => ({})),
    },
    account: {
      findFirst: vi.fn(async () => ({ id: 'acc-destino', balanceCents: 0n })),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { balanceCents: { increment: bigint } } }) => {
        balanceOps.push({ id: where.id, increment: data.balanceCents.increment });
        return {};
      }),
    },
  };

  return {
    service: new TransactionsService({ client } as unknown as PrismaService),
    created,
    balanceOps,
    updates,
    state,
  };
}

const almoco = {
  id: 'tx-almoco',
  type: 'EXPENSE',
  amountCents: 12000n,
  description: 'Almoço com cliente',
  status: 'CLEARED',
  isReimbursable: true,
  reimbursedAt: null,
  categoryId: 'alimentacao',
  accountId: 'acc-1',
  fromAccountId: null,
  toAccountId: null,
  reimbursements: [],
};

describe('TransactionsService.reimburse (regra 5.13)', () => {
  it('cria estorno vinculado, credita a conta e herda a categoria', async () => {
    const { service, created, balanceOps } = makePrisma(almoco);

    const out = await service.reimburse(USER, 'tx-almoco', { accountId: 'acc-destino' });

    expect(created).toHaveLength(1);
    const refund = created[0];
    expect(refund.type).toBe('INCOME');
    expect(refund.amountCents).toBe(12000n);
    expect(refund.reimbursesTransactionId).toBe('tx-almoco');
    expect(refund.categoryId).toBe('alimentacao'); // abate o gasto na categoria certa
    expect(refund.accountId).toBe('acc-destino');
    expect(refund.status).toBe('CLEARED');

    // O dinheiro entra de verdade na conta escolhida.
    expect(balanceOps).toEqual([{ id: 'acc-destino', increment: 12000n }]);
    expect(out.settled).toBe(true);
    expect(out.remainingCents).toBe(0n);
  });

  it('sem valor informado, estorna exatamente o que falta', async () => {
    const { service, created } = makePrisma({
      ...almoco,
      reimbursements: [{ amountCents: 5000n }],
    });
    const out = await service.reimburse(USER, 'tx-almoco', { accountId: 'acc-destino' });
    expect(created[0].amountCents).toBe(7000n);
    expect(out.reimbursedCents).toBe(12000n);
    expect(out.settled).toBe(true);
  });

  it('reembolso parcial mantém o gasto pendente', async () => {
    const { service, updates } = makePrisma(almoco);
    const out = await service.reimburse(USER, 'tx-almoco', {
      accountId: 'acc-destino',
      amountCents: 10000,
    });
    expect(out.settled).toBe(false);
    expect(out.remainingCents).toBe(2000n);
    // reimbursedAt continua null: ainda aparece em "A receber".
    expect(updates.some((u) => u.reimbursedAt === null)).toBe(true);
  });

  it('recusa valor acima do que falta', async () => {
    const { service } = makePrisma({ ...almoco, reimbursements: [{ amountCents: 10000n }] });
    await expect(
      service.reimburse(USER, 'tx-almoco', { accountId: 'acc-destino', amountCents: 5000 }),
    ).rejects.toThrow(/acima do que falta/i);
  });

  it('recusa gasto já totalmente reembolsado', async () => {
    const { service } = makePrisma({ ...almoco, reimbursements: [{ amountCents: 12000n }] });
    await expect(service.reimburse(USER, 'tx-almoco', { accountId: 'acc-destino' })).rejects.toThrow(
      /já foi totalmente reembolsado/i,
    );
  });

  it('recusa lançamento não marcado como reembolsável', async () => {
    const { service } = makePrisma({ ...almoco, isReimbursable: false });
    await expect(service.reimburse(USER, 'tx-almoco', { accountId: 'acc-destino' })).rejects.toThrow(
      /não está marcado como reembolsável/i,
    );
  });

  it('recusa reembolso de previsto e de receita', async () => {
    const previsto = makePrisma({ ...almoco, status: 'FORECAST' });
    await expect(previsto.service.reimburse(USER, 'tx-almoco', { accountId: 'acc-destino' })).rejects.toThrow(
      /Efetive o lançamento previsto/i,
    );

    const receita = makePrisma({ ...almoco, type: 'INCOME' });
    await expect(receita.service.reimburse(USER, 'tx-almoco', { accountId: 'acc-destino' })).rejects.toThrow(
      /Só uma despesa pode ser reembolsada/i,
    );
  });

  it('desfazer devolve o saldo e limpa o recebimento', async () => {
    const { service, balanceOps, state } = makePrisma({
      ...almoco,
      reimbursedAt: new Date(),
      reimbursements: [
        { id: 'r1', type: 'INCOME', amountCents: 12000n, status: 'CLEARED', accountId: 'acc-destino' },
      ],
    });

    const out = await service.undoReimburse(USER, 'tx-almoco');

    expect(out.removed).toBe(1);
    // Saldo revertido: o crédito do estorno sai da conta.
    expect(balanceOps).toEqual([{ id: 'acc-destino', increment: -12000n }]);
    expect(state.reimbursedAt).toBeNull();
  });
});
