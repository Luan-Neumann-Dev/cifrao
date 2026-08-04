import { describe, expect, it } from 'vitest';
import {
  QUANTITY_SCALE,
  allocationByClass,
  applyContribution,
  applyRedemption,
  averagePriceCents,
  costOfCents,
  formatQuantity,
  positionMetrics,
  toQuantity,
} from './investment-logic';

/** Atalho: `q(10)` = 10 unidades na escala interna. */
const q = (units: number | string) => toQuantity(units);
const zerada = { quantity: 0n, investedCents: 0n };

describe('quantidade (inteiro na escala 1e-8)', () => {
  it('converte decimal em ponto e em vírgula', () => {
    expect(toQuantity('10')).toBe(10n * QUANTITY_SCALE);
    expect(toQuantity('1.5')).toBe(150_000_000n);
    expect(toQuantity('1,5')).toBe(150_000_000n);
    expect(toQuantity('1.000,5')).toBe(1000n * QUANTITY_SCALE + 50_000_000n);
  });

  it('aguenta fração de cripto sem perder precisão', () => {
    expect(toQuantity('0.00123456')).toBe(123_456n);
    expect(formatQuantity(123_456n)).toBe('0.00123456');
  });

  it('formata sem zeros à direita', () => {
    expect(formatQuantity(10n * QUANTITY_SCALE)).toBe('10');
    expect(formatQuantity(150_000_000n)).toBe('1.5');
  });

  it('recusa entrada inválida', () => {
    expect(() => toQuantity('')).toThrow(/vazia/);
    expect(() => toQuantity('abc')).toThrow(/inválida/);
  });
});

describe('custo e preço médio', () => {
  it('custo arredonda ao centavo mais próximo', () => {
    expect(costOfCents(q('10'), 2000n)).toBe(20_000n); // 10 × R$ 20,00
    expect(costOfCents(q('0.5'), 333n)).toBe(167n); // 1,665 -> 1,67
  });

  it('preço médio é derivado do custo, não acumulado sobre si mesmo', () => {
    expect(averagePriceCents(20_000n, q('10'))).toBe(2000n);
    expect(averagePriceCents(0n, 0n)).toBe(0n);
  });
});

describe('ACEITE: preço médio recalcula corretamente após novo aporte', () => {
  it('dois aportes de mesma quantidade dão a média simples', () => {
    // 10 a R$ 20,00 e depois 10 a R$ 30,00 => médio R$ 25,00
    const primeiro = applyContribution(zerada, { quantity: q('10'), priceCents: 2000n });
    expect(primeiro.avgPriceCents).toBe(2000n);
    expect(primeiro.investedCents).toBe(20_000n);

    const segundo = applyContribution(primeiro, { quantity: q('10'), priceCents: 3000n });
    expect(segundo.quantity).toBe(q('20'));
    expect(segundo.investedCents).toBe(50_000n);
    expect(segundo.avgPriceCents).toBe(2500n);
  });

  it('quantidades diferentes dão média ponderada, não média simples', () => {
    // 10 a R$ 20,00 + 5 a R$ 26,00 => (200 + 130) / 15 = R$ 22,00
    const posicao = applyContribution(
      applyContribution(zerada, { quantity: q('10'), priceCents: 2000n }),
      { quantity: q('5'), priceCents: 2600n },
    );
    expect(posicao.quantity).toBe(q('15'));
    expect(posicao.investedCents).toBe(33_000n);
    expect(posicao.avgPriceCents).toBe(2200n);
  });

  it('taxas entram no preço médio (como manda a regra brasileira)', () => {
    const posicao = applyContribution(zerada, {
      quantity: q('10'),
      priceCents: 2000n,
      feesCents: 500n,
    });
    expect(posicao.investedCents).toBe(20_500n);
    expect(posicao.avgPriceCents).toBe(2050n);
    expect(posicao.totalCents).toBe(20_500n);
  });

  it('aporte não realiza lucro', () => {
    const posicao = applyContribution(zerada, { quantity: q('1'), priceCents: 1000n });
    expect(posicao.realizedGainCents).toBe(0n);
  });

  it('muitos aportes não acumulam erro de arredondamento', () => {
    // Preço "feio" 33,33 repetido: o custo somado tem que bater exatamente.
    let posicao = zerada;
    for (let i = 0; i < 50; i++) {
      posicao = applyContribution(posicao, { quantity: q('3'), priceCents: 3333n });
    }
    expect(posicao.quantity).toBe(q('150'));
    // 50 × (3 × 33,33) = 50 × 99,99 = 4.999,50
    expect(posicao.investedCents).toBe(499_950n);
    expect(posicao.avgPriceCents).toBe(3333n);
  });

  it('recusa aporte com quantidade não positiva', () => {
    expect(() => applyContribution(zerada, { quantity: 0n, priceCents: 100n })).toThrow(/positiva/);
  });
});

describe('resgate', () => {
  const posicao = applyContribution(zerada, { quantity: q('10'), priceCents: 2000n });

  it('venda NÃO muda o preço médio, só a quantidade', () => {
    const depois = applyRedemption(posicao, { quantity: q('4'), priceCents: 3000n });
    expect(depois.quantity).toBe(q('6'));
    expect(depois.avgPriceCents).toBe(2000n); // segue o mesmo
    expect(depois.investedCents).toBe(12_000n); // custo proporcional ao que ficou
  });

  it('realiza o lucro sobre a parte vendida', () => {
    const depois = applyRedemption(posicao, { quantity: q('4'), priceCents: 3000n });
    // Vendeu por 120,00 o que custou 80,00.
    expect(depois.totalCents).toBe(12_000n);
    expect(depois.realizedGainCents).toBe(4_000n);
  });

  it('prejuízo vem negativo', () => {
    const depois = applyRedemption(posicao, { quantity: q('5'), priceCents: 1500n });
    expect(depois.realizedGainCents).toBe(-2_500n);
  });

  it('taxas saem do valor recebido e reduzem o lucro', () => {
    const depois = applyRedemption(posicao, {
      quantity: q('4'),
      priceCents: 3000n,
      feesCents: 500n,
    });
    expect(depois.totalCents).toBe(11_500n);
    expect(depois.realizedGainCents).toBe(3_500n);
  });

  it('vender tudo zera a posição sem deixar resto de custo', () => {
    const depois = applyRedemption(posicao, { quantity: q('10'), priceCents: 2500n });
    expect(depois.quantity).toBe(0n);
    expect(depois.investedCents).toBe(0n);
    expect(depois.avgPriceCents).toBe(0n);
    expect(depois.realizedGainCents).toBe(5_000n);
  });

  it('recusa resgate maior que a carteira', () => {
    expect(() => applyRedemption(posicao, { quantity: q('11'), priceCents: 2000n })).toThrow(
      /maior que a quantidade/,
    );
  });

  it('aporte depois de venda parcial usa o custo que sobrou', () => {
    const aposVenda = applyRedemption(posicao, { quantity: q('5'), priceCents: 3000n });
    // Sobrou 5 unidades custando 100,00 (médio 20,00).
    const novoAporte = applyContribution(aposVenda, { quantity: q('5'), priceCents: 3000n });
    expect(novoAporte.quantity).toBe(q('10'));
    expect(novoAporte.investedCents).toBe(25_000n);
    expect(novoAporte.avgPriceCents).toBe(2500n);
  });
});

describe('rentabilidade', () => {
  const posicao = { quantity: q('10'), investedCents: 20_000n };

  it('valorização dá ganho absoluto e percentual', () => {
    const m = positionMetrics(posicao, 2500n);
    expect(m.marketValueCents).toBe(25_000n);
    expect(m.gainCents).toBe(5_000n);
    expect(m.gainPercent).toBe(25);
  });

  it('desvalorização vem negativa', () => {
    const m = positionMetrics(posicao, 1600n);
    expect(m.gainCents).toBe(-4_000n);
    expect(m.gainPercent).toBe(-20);
  });

  it('sem custo investido não inventa percentual', () => {
    const m = positionMetrics({ quantity: 0n, investedCents: 0n }, 1000n);
    expect(m.gainPercent).toBeNull();
  });
});

describe('alocação por classe', () => {
  const posicoes = [
    { class: 'STOCKS' as const, marketValueCents: 60_000n },
    { class: 'REITS' as const, marketValueCents: 30_000n },
    { class: 'FIXED_INCOME' as const, marketValueCents: 10_000n },
  ];

  it('calcula participação de cada classe', () => {
    const slices = allocationByClass(posicoes);
    expect(slices.map((s) => s.class)).toEqual(['STOCKS', 'REITS', 'FIXED_INCOME']);
    expect(slices[0].percent).toBe(60);
    expect(slices[2].percent).toBe(10);
    expect(slices[0].targetPercent).toBeNull();
  });

  it('compara com o alvo e diz quanto falta comprar', () => {
    const alvos = new Map([
      ['STOCKS' as const, 40],
      ['FIXED_INCOME' as const, 40],
    ]);
    const slices = allocationByClass(posicoes, alvos);

    const acoes = slices.find((s) => s.class === 'STOCKS')!;
    expect(acoes.deviationPoints).toBe(20); // 60% contra alvo de 40%
    expect(acoes.adjustmentCents).toBe(-20_000n); // vender R$ 200

    const renda = slices.find((s) => s.class === 'FIXED_INCOME')!;
    expect(renda.deviationPoints).toBe(-30);
    expect(renda.adjustmentCents).toBe(30_000n); // comprar R$ 300
  });

  it('classe com alvo mas sem posição aparece como falta comprar', () => {
    const slices = allocationByClass(posicoes, new Map([['CRYPTO' as const, 10]]));
    const cripto = slices.find((s) => s.class === 'CRYPTO');
    expect(cripto?.marketValueCents).toBe(0n);
    expect(cripto?.adjustmentCents).toBe(10_000n);
  });

  it('carteira vazia não divide por zero', () => {
    expect(allocationByClass([])).toEqual([]);
    const slices = allocationByClass([], new Map([['STOCKS' as const, 100]]));
    expect(slices[0].percent).toBe(0);
  });
});
