import { describe, expect, it } from 'vitest';
import {
  BUDGET_WARN_PERCENT,
  DEFAULT_NOTIFICATION_PREFS,
  type NotificationInput,
  budgetUsagePercent,
  buildNotifications,
} from './notification-logic';

const HOJE = { year: 2026, month: 8, day: 4 };

function input(over: Partial<NotificationInput> = {}): NotificationInput {
  return { today: HOJE, prefs: DEFAULT_NOTIFICATION_PREFS, ...over };
}

describe('fatura vencendo', () => {
  const fatura = (over: Partial<Parameters<typeof buildNotifications>[0]['invoices'][number]> = {}) => ({
    id: 'inv1',
    cardName: 'Nubank',
    dueDate: { year: 2026, month: 8, day: 6 },
    remainingCents: 45000n,
    ...over,
  });

  it('avisa dentro da antecedência configurada', () => {
    const out = buildNotifications(input({ invoices: [fatura()] }));
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('INVOICE_DUE');
    expect(out[0].severity).toBe('warn');
    expect(out[0].amountCents).toBe(45000n);
  });

  it('cala fora da antecedência', () => {
    const longe = fatura({ dueDate: { year: 2026, month: 8, day: 20 } });
    expect(buildNotifications(input({ invoices: [longe] }))).toEqual([]);
  });

  it('respeita a antecedência maior', () => {
    const longe = fatura({ dueDate: { year: 2026, month: 8, day: 20 } });
    const out = buildNotifications(
      input({ invoices: [longe], prefs: { ...DEFAULT_NOTIFICATION_PREFS, notifyDaysBefore: 20 } }),
    );
    expect(out).toHaveLength(1);
  });

  it('vencida vira alerta vermelho', () => {
    const vencida = fatura({ dueDate: { year: 2026, month: 7, day: 28 } });
    const out = buildNotifications(input({ invoices: [vencida] }));
    expect(out[0].severity).toBe('danger');
    expect(out[0].title).toContain('venceu');
  });

  it('fatura quitada não avisa (regra 5.6: pagar zera o que falta)', () => {
    const paga = fatura({ remainingCents: 0n });
    expect(buildNotifications(input({ invoices: [paga] }))).toEqual([]);
  });

  it('some quando o dono desliga a preferência', () => {
    const out = buildNotifications(
      input({ invoices: [fatura()], prefs: { ...DEFAULT_NOTIFICATION_PREFS, notifyInvoiceDue: false } }),
    );
    expect(out).toEqual([]);
  });
});

describe('orçamento', () => {
  it('estourado é vermelho e mostra quanto passou', () => {
    const out = buildNotifications(
      input({
        budgets: [
          { categoryId: 'c1', categoryName: 'Mercado', limitCents: 50000n, spentCents: 62000n },
        ],
      }),
    );
    expect(out[0].severity).toBe('danger');
    expect(out[0].amountCents).toBe(12000n);
    expect(out[0].detail).toContain('124%');
  });

  it('perto do limite é amarelo', () => {
    const out = buildNotifications(
      input({
        budgets: [
          { categoryId: 'c1', categoryName: 'Mercado', limitCents: 50000n, spentCents: 45000n },
        ],
      }),
    );
    expect(out[0].severity).toBe('warn');
  });

  it('abaixo do limiar não avisa', () => {
    const out = buildNotifications(
      input({
        budgets: [
          { categoryId: 'c1', categoryName: 'Mercado', limitCents: 50000n, spentCents: 30000n },
        ],
      }),
    );
    expect(out).toEqual([]);
  });

  it('limite zero não gera aviso nem divisão por zero', () => {
    const out = buildNotifications(
      input({
        budgets: [{ categoryId: 'c1', categoryName: 'X', limitCents: 0n, spentCents: 100n }],
      }),
    );
    expect(out).toEqual([]);
    expect(budgetUsagePercent(100n, 0n)).toBe(0);
  });

  it('o limiar amarelo é o valor documentado', () => {
    expect(BUDGET_WARN_PERCENT).toBe(80);
    expect(budgetUsagePercent(40000n, 50000n)).toBe(80);
  });
});

describe('meta', () => {
  it('avisa quando o saldo vinculado cobre o alvo', () => {
    const out = buildNotifications(
      input({ goals: [{ id: 'g1', name: 'Viagem', targetCents: 100000n, currentCents: 100000n }] }),
    );
    expect(out[0].kind).toBe('GOAL_REACHED');
    expect(out[0].severity).toBe('info');
  });

  it('não avisa antes de alcançar', () => {
    const out = buildNotifications(
      input({ goals: [{ id: 'g1', name: 'Viagem', targetCents: 100000n, currentCents: 99999n }] }),
    );
    expect(out).toEqual([]);
  });
});

describe('previsto a confirmar (regra 5.11)', () => {
  it('avisa o que vence dentro da antecedência', () => {
    const out = buildNotifications(
      input({
        forecasts: [
          {
            id: 'f1',
            description: 'Aluguel',
            date: { year: 2026, month: 8, day: 5 },
            amountCents: 180000n,
            type: 'EXPENSE',
          },
        ],
      }),
    );
    expect(out[0].kind).toBe('FORECAST_DUE');
    expect(out[0].severity).toBe('info');
  });

  it('previsto vencido pede atenção', () => {
    const out = buildNotifications(
      input({
        forecasts: [
          {
            id: 'f1',
            description: 'Aluguel',
            date: { year: 2026, month: 8, day: 1 },
            amountCents: 180000n,
            type: 'EXPENSE',
          },
        ],
      }),
    );
    expect(out[0].severity).toBe('warn');
    expect(out[0].title).toContain('atrasado');
  });
});

describe('lista final', () => {
  it('ordena por gravidade e depois por data', () => {
    const out = buildNotifications(
      input({
        invoices: [
          {
            id: 'vencida',
            cardName: 'A',
            dueDate: { year: 2026, month: 7, day: 30 },
            remainingCents: 100n,
          },
          {
            id: 'proxima',
            cardName: 'B',
            dueDate: { year: 2026, month: 8, day: 5 },
            remainingCents: 100n,
          },
        ],
        goals: [{ id: 'g1', name: 'Meta', targetCents: 10n, currentCents: 10n }],
      }),
    );
    expect(out.map((n) => n.severity)).toEqual(['danger', 'warn', 'info']);
  });

  it('o id é estável entre chamadas iguais', () => {
    const args = input({ goals: [{ id: 'g1', name: 'M', targetCents: 1n, currentCents: 1n }] });
    expect(buildNotifications(args)[0].id).toBe(buildNotifications(args)[0].id);
    expect(buildNotifications(args)[0].id).toBe('goal:g1');
  });

  it('sem nada acontecendo, não inventa aviso', () => {
    expect(buildNotifications(input())).toEqual([]);
  });

  it('todo aviso aponta para uma tela do painel', () => {
    const out = buildNotifications(
      input({
        invoices: [
          { id: 'i', cardName: 'A', dueDate: HOJE, remainingCents: 1n },
        ],
        budgets: [{ categoryId: 'c', categoryName: 'X', limitCents: 10n, spentCents: 99n }],
        goals: [{ id: 'g', name: 'M', targetCents: 1n, currentCents: 1n }],
        forecasts: [
          { id: 'f', description: 'D', date: HOJE, amountCents: 1n, type: 'EXPENSE' },
        ],
      }),
    );
    expect(out).toHaveLength(4);
    expect(out.every((n) => n.href.startsWith('/painel'))).toBe(true);
  });
});
