import { describe, expect, it } from 'vitest';
import { cardGradient, invoiceStateStyle, isHeavyMonth, limitBreakdown } from './cards';

describe('degradê do cartão', () => {
  it('escurece a própria cor, sem cinza genérico', () => {
    expect(cardGradient('#FF7A00')).toBe(
      'linear-gradient(135deg, #FF7A00, color-mix(in oklab, #FF7A00, #000 26%))',
    );
  });

  it('cartão sem cor cai no roxo padrão', () => {
    expect(cardGradient(null)).toContain('#820AD1');
  });
});

describe('barra do limite (regra 5.5)', () => {
  const availability = {
    limitCents: '800000',
    openInvoiceCents: '321045',
    closedUnpaidCents: '0',
    futureCommittedCents: '184490',
    availableCents: '294465',
  };

  it('separa fatura aberta e parcelas futuras, e sobra o disponível', () => {
    const b = limitBreakdown(availability);
    expect(b.segments.map((s) => s.key)).toEqual(['open', 'future']);
    expect(b.segments[0].percent).toBeCloseTo(40.13, 1);
    expect(b.segments[1].percent).toBeCloseTo(23.06, 1);
    expect(b.availablePercent).toBeCloseTo(36.81, 1);
  });

  it('parcela futura tem preenchimento hachurado — não é gasto feito', () => {
    const b = limitBreakdown(availability);
    expect(b.segments[1].fill).toContain('repeating-linear-gradient');
    expect(b.segments[0].fill).toBe('var(--primary)');
  });

  it('fatura fechada e não quitada aparece como um terceiro pedaço', () => {
    const b = limitBreakdown({ ...availability, closedUnpaidCents: '100000' });
    expect(b.segments.map((s) => s.key)).toEqual(['open', 'closed', 'future']);
  });

  it('estouro de limite não passa de 100% na barra', () => {
    const b = limitBreakdown({
      limitCents: '100000',
      openInvoiceCents: '250000',
      closedUnpaidCents: '0',
      futureCommittedCents: '0',
      availableCents: '-150000',
    });
    expect(b.segments[0].percent).toBe(100);
    expect(b.availablePercent).toBe(0);
  });

  it('cartão sem limite cadastrado não divide por zero', () => {
    const b = limitBreakdown({
      limitCents: '0',
      openInvoiceCents: '5000',
      closedUnpaidCents: '0',
      futureCommittedCents: '0',
      availableCents: '-5000',
    });
    expect(b.segments[0].percent).toBe(0);
    expect(Number.isNaN(b.segments[0].percent)).toBe(false);
  });
});

describe('estado da fatura', () => {
  it('aberta usa a cor primária; paga, a positiva', () => {
    expect(invoiceStateStyle('OPEN').color).toBe('var(--primary)');
    expect(invoiceStateStyle('PAID').color).toBe('var(--positive)');
  });

  it('parcial avisa que ainda resta pagar', () => {
    expect(invoiceStateStyle('PARTIAL').label).toContain('resta pagar');
    expect(invoiceStateStyle('PARTIAL').shortLabel).toBe('Parcial');
  });
});

describe('mês pesado de parcelas', () => {
  it('acima de R$ 1.000 destaca', () => {
    expect(isHeavyMonth('100001')).toBe(true);
    expect(isHeavyMonth('100000')).toBe(false);
    expect(isHeavyMonth(0)).toBe(false);
  });
});
