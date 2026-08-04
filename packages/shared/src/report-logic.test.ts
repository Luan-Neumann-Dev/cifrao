import { describe, expect, it } from 'vitest';
import { formatInSaoPaulo } from './date';
import {
  accumulateSeries,
  averageCents,
  biggestVariations,
  buildCategoryReport,
  computeVariation,
  csvCell,
  percentOf,
  periodDays,
  pickGranularity,
  previousPeriod,
  toCsv,
} from './report-logic';

const d = (iso: string) => new Date(`${iso}T00:00:00Z`);

describe('período de comparação (Fase 7)', () => {
  /** Meia-noite e 23:59:59 de São Paulo, que é como o serviço monta o período. */
  const sp = (iso: string, end = false) =>
    new Date(`${iso}T${end ? '23:59:59' : '00:00:00'}-03:00`);

  it('agosto compara com julho', () => {
    const anterior = previousPeriod({ from: sp('2026-08-01'), to: sp('2026-08-31', true) });
    expect(formatInSaoPaulo(anterior.from)).toBe('01/07/2026');
    expect(formatInSaoPaulo(anterior.to)).toBe('31/07/2026');
  });

  it('mês cheio compara com o mês cheio anterior, mesmo de tamanho diferente', () => {
    // Março tem 31 dias e fevereiro 28: uma janela de tamanho fixo cairia em
    // 29/01 e misturaria dois meses.
    const anterior = previousPeriod({ from: sp('2026-03-01'), to: sp('2026-03-31', true) });
    expect(formatInSaoPaulo(anterior.from)).toBe('01/02/2026');
    expect(formatInSaoPaulo(anterior.to)).toBe('28/02/2026');
  });

  it('fevereiro bissexto compara com janeiro inteiro', () => {
    const anterior = previousPeriod({ from: sp('2028-02-01'), to: sp('2028-02-29', true) });
    expect(formatInSaoPaulo(anterior.from)).toBe('01/01/2028');
    expect(formatInSaoPaulo(anterior.to)).toBe('31/01/2028');
  });

  it('janeiro compara com dezembro do ano anterior', () => {
    const anterior = previousPeriod({ from: sp('2026-01-01'), to: sp('2026-01-31', true) });
    expect(formatInSaoPaulo(anterior.from)).toBe('01/12/2025');
    expect(formatInSaoPaulo(anterior.to)).toBe('31/12/2025');
  });

  it('período livre compara com a mesma quantidade de dias logo antes', () => {
    const anterior = previousPeriod({ from: d('2026-08-10'), to: d('2026-08-19') }); // 10 dias
    expect(anterior.from.toISOString().slice(0, 10)).toBe('2026-07-31');
    expect(anterior.to.toISOString().slice(0, 10)).toBe('2026-08-09');
    expect(periodDays(anterior)).toBe(10);
  });

  it('as duas janelas têm sempre o mesmo tamanho e não se sobrepõem', () => {
    const atual = { from: d('2026-03-05'), to: d('2026-04-17') };
    const anterior = previousPeriod(atual);
    expect(periodDays(anterior)).toBe(periodDays(atual));
    expect(anterior.to.getTime()).toBeLessThan(atual.from.getTime());
  });

  it('granularidade: dia para janelas curtas, mês para longas', () => {
    expect(pickGranularity({ from: d('2026-08-01'), to: d('2026-08-31') })).toBe('day');
    expect(pickGranularity({ from: d('2026-01-01'), to: d('2026-12-31') })).toBe('month');
  });
});

describe('variação contra o período anterior', () => {
  it('calcula delta e percentual', () => {
    const v = computeVariation(15000n, 10000n);
    expect(v.deltaCents).toBe(5000n);
    expect(v.percentChange).toBe(50);
  });

  it('queda vem negativa', () => {
    const v = computeVariation(8000n, 10000n);
    expect(v.deltaCents).toBe(-2000n);
    expect(v.percentChange).toBe(-20);
  });

  it('sem base anterior não inventa percentual', () => {
    const v = computeVariation(5000n, 0n);
    expect(v.deltaCents).toBe(5000n);
    expect(v.percentChange).toBeNull();
  });

  it('as maiores variações consideram queda tanto quanto alta', () => {
    const top = biggestVariations(
      [
        { id: 'a', deltaCents: 1000n },
        { id: 'b', deltaCents: -9000n },
        { id: 'c', deltaCents: 5000n },
        { id: 'd', deltaCents: 0n },
      ],
      2,
    );
    expect(top.map((t) => t.id)).toEqual(['b', 'c']);
  });
});

describe('participação, média e acumulado', () => {
  it('percentual da parte no total', () => {
    expect(percentOf(2500n, 10000n)).toBe(25);
    expect(percentOf(1n, 3n)).toBeCloseTo(33.33, 2);
    expect(percentOf(100n, 0n)).toBe(0);
  });

  it('média por lançamento trunca no centavo', () => {
    expect(averageCents(10000n, 3)).toBe(3333n);
    expect(averageCents(10000n, 0)).toBe(0n);
  });

  it('saldo acumulado soma ponto a ponto', () => {
    const serie = accumulateSeries([
      { bucket: '2026-08-01', incomeCents: 500000n, expenseCents: 100000n },
      { bucket: '2026-08-02', incomeCents: 0n, expenseCents: 150000n },
      { bucket: '2026-08-03', incomeCents: 20000n, expenseCents: 0n },
    ]);
    expect(serie.map((p) => p.netCents)).toEqual([400000n, -150000n, 20000n]);
    expect(serie.map((p) => p.cumulativeCents)).toEqual([400000n, 250000n, 270000n]);
    // O último acumulado é exatamente a soma de tudo (aceite da fase).
    expect(serie[2].cumulativeCents).toBe(400000n - 150000n + 20000n);
  });
});

describe('tabela por categoria', () => {
  const linhas = [
    { categoryId: 'mercado', totalCents: 60000n, count: 12, previousCents: 50000n },
    { categoryId: 'transporte', totalCents: 30000n, count: 6, previousCents: 40000n },
    { categoryId: 'lazer', totalCents: 10000n, count: 2, previousCents: 0n },
  ];

  it('fecha percentual, média e variação, ordenado pelo maior gasto', () => {
    const total = 100000n;
    const report = buildCategoryReport(linhas, total);

    expect(report.map((r) => r.categoryId)).toEqual(['mercado', 'transporte', 'lazer']);
    expect(report[0].percent).toBe(60);
    expect(report[0].averageCents).toBe(5000n);
    expect(report[0].deltaCents).toBe(10000n);
    expect(report[0].percentChange).toBe(20);
    expect(report[1].deltaCents).toBe(-10000n);
    expect(report[2].percentChange).toBeNull(); // categoria nova
  });

  it('a soma dos percentuais fecha em 100 (aceite: números batem)', () => {
    const total = linhas.reduce((acc, r) => acc + r.totalCents, 0n);
    const report = buildCategoryReport(linhas, total);
    const soma = report.reduce((acc, r) => acc + r.percent, 0);
    expect(soma).toBeCloseTo(100, 6);
    const somaCents = report.reduce((acc, r) => acc + r.totalCents, 0n);
    expect(somaCents).toBe(total);
  });
});

describe('exportação CSV', () => {
  it('escapa separador, aspas e quebra de linha', () => {
    expect(csvCell('Mercado')).toBe('Mercado');
    expect(csvCell('PADARIA; CENTRAL')).toBe('"PADARIA; CENTRAL"');
    expect(csvCell('Diz "oi"')).toBe('"Diz ""oi"""');
    expect(csvCell(null)).toBe('');
    expect(csvCell(1234n)).toBe('1234');
  });

  it('monta o arquivo com BOM e CRLF', () => {
    const csv = toCsv(['Data', 'Descrição'], [['01/08/2026', 'MERCADO; SÃO JOÃO']]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('Data;Descrição\r\n');
    expect(csv).toContain('"MERCADO; SÃO JOÃO"');
  });
});
