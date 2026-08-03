import { monthKeyInSaoPaulo, saoPauloDateParts } from '@cifrao/shared';
import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service';
import { RecurringRulesService } from './recurring-rules.service';

type Created = { date: Date; description: string; status: string; amountCents: bigint; type: string };

/**
 * Prisma fake mínimo: registra o que foi criado/apagado para provar a regra 5.11
 * sem subir banco. O aceite da fase — "uma recorrência mensal gera previstos
 * corretos por 12 meses" — é verificado aqui de ponta a ponta no serviço.
 */
function makePrisma(rule: Record<string, unknown>, confirmed: { date: Date }[] = []) {
  const createMany = vi.fn(async ({ data }: { data: Created[] }) => ({ count: data.length }));
  const deleteMany = vi.fn(async () => ({ count: 0 }));
  const client = {
    recurringRule: {
      findUnique: vi.fn(async () => rule),
      update: vi.fn(async () => rule),
      findMany: vi.fn(async () => [rule]),
    },
    transaction: {
      deleteMany,
      createMany,
      findMany: vi.fn(async () => confirmed),
    },
    account: { count: vi.fn(async () => 1) },
  };
  return { service: new RecurringRulesService({ client } as unknown as PrismaService), createMany, deleteMany };
}

const baseRule = {
  id: 'rule-1',
  description: 'Aluguel',
  type: 'EXPENSE',
  amountCents: 250_000n,
  frequency: 'MONTHLY',
  dayOfMonth: 10,
  startDate: new Date('2026-01-10T15:00:00Z'),
  endDate: null,
  active: true,
  notes: null,
  accountId: 'acc-1',
  fromAccountId: null,
  toAccountId: null,
  categoryId: 'cat-1',
};

describe('RecurringRulesService (regra 5.11)', () => {
  it('aceite: recorrência mensal gera 12 previstos, um por mês, no dia certo', async () => {
    const { service, createMany } = makePrisma(baseRule);
    const now = new Date('2026-08-03T12:00:00Z');

    const count = await service.generateForRule('rule-1', now);

    const rows = createMany.mock.calls[0][0].data as Created[];
    expect(count).toBe(rows.length);

    const meses = rows.map((r) => monthKeyInSaoPaulo(r.date));
    // Do dia 10/08/2026 até o horizonte de 12 meses (03/08/2027): 12 previstos.
    expect(rows).toHaveLength(12);
    expect(new Set(meses).size).toBe(12); // um por mês, sem repetir
    expect(meses[0]).toBe('2026-08');
    expect(meses[11]).toBe('2027-07');

    // Todo previsto cai no dia 10 no fuso de São Paulo (regra 5.2).
    for (const row of rows) {
      expect(saoPauloDateParts(row.date).day).toBe(10);
      expect(row.status).toBe('FORECAST');
      expect(row.amountCents).toBe(250_000n);
      expect(row.type).toBe('EXPENSE');
    }
  });

  it('previsto não move saldo: nenhuma conta é atualizada na geração', async () => {
    const { service } = makePrisma(baseRule);
    const client = (service as unknown as { prisma: { client: Record<string, unknown> } }).prisma
      .client;
    await service.generateForRule('rule-1', new Date('2026-08-03T12:00:00Z'));
    // O fake não expõe account.update — se o serviço tentasse mexer em saldo, quebraria.
    expect(Object.keys(client.account as object)).toEqual(['count']);
  });

  it('regenera só do dia de hoje em diante (não toca no passado)', async () => {
    const { service, deleteMany } = makePrisma(baseRule);
    const now = new Date('2026-08-03T12:00:00Z');
    await service.generateForRule('rule-1', now);

    const where = deleteMany.mock.calls[0][0].where as {
      recurringRuleId: string;
      status: string;
      date: { gte: Date };
    };
    expect(where.recurringRuleId).toBe('rule-1');
    expect(where.status).toBe('FORECAST');
    expect(saoPauloDateParts(where.date.gte)).toEqual({ year: 2026, month: 8, day: 3 });
  });

  it('não recria data já confirmada pelo usuário (previsto que virou efetivado)', async () => {
    const confirmado = [{ date: new Date('2026-08-10T15:00:00Z') }];
    const { service, createMany } = makePrisma(baseRule, confirmado);
    await service.generateForRule('rule-1', new Date('2026-08-03T12:00:00Z'));

    const rows = createMany.mock.calls[0][0].data as Created[];
    const meses = rows.map((r) => monthKeyInSaoPaulo(r.date));
    expect(meses).not.toContain('2026-08'); // agosto já foi efetivado
    expect(rows).toHaveLength(11);
  });

  it('regra inativa não gera nada', async () => {
    const { service, createMany } = makePrisma({ ...baseRule, active: false });
    const count = await service.generateForRule('rule-1', new Date('2026-08-03T12:00:00Z'));
    expect(count).toBe(0);
    expect(createMany).not.toHaveBeenCalled();
  });

  it('data final corta a série antes do horizonte', async () => {
    const { service, createMany } = makePrisma({
      ...baseRule,
      endDate: new Date('2026-10-10T15:00:00Z'),
    });
    await service.generateForRule('rule-1', new Date('2026-08-03T12:00:00Z'));

    const rows = createMany.mock.calls[0][0].data as Created[];
    expect(rows.map((r) => monthKeyInSaoPaulo(r.date))).toEqual(['2026-08', '2026-09', '2026-10']);
  });

  it('transferência recorrente carrega as duas contas e nenhuma categoria', async () => {
    const { service, createMany } = makePrisma({
      ...baseRule,
      type: 'TRANSFER',
      accountId: null,
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      categoryId: null,
    });
    await service.generateForRule('rule-1', new Date('2026-08-03T12:00:00Z'));

    const rows = createMany.mock.calls[0][0].data as unknown as {
      fromAccountId: string;
      toAccountId: string;
      categoryId: string | null;
      type: string;
    }[];
    expect(rows[0].type).toBe('TRANSFER');
    expect(rows[0].fromAccountId).toBe('acc-1');
    expect(rows[0].toAccountId).toBe('acc-2');
    expect(rows[0].categoryId).toBeNull();
  });
});
