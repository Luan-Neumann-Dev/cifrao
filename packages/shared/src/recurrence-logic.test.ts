import { describe, expect, it } from 'vitest';
import {
  addDaysToParts,
  compareDateParts,
  dateKeyFromParts,
  nextOccurrences,
  occurrencesBetween,
  occurrencesUntil,
} from './recurrence-logic';

const keys = (parts: { year: number; month: number; day: number }[]) => parts.map(dateKeyFromParts);

describe('recorrência (regra 5.11)', () => {
  it('aceite da fase: mensal gera 12 previstos corretos em 12 meses', () => {
    const out = occurrencesUntil(
      { frequency: 'MONTHLY', start: { year: 2026, month: 8, day: 5 } },
      { year: 2027, month: 7, day: 31 },
    );
    expect(out).toHaveLength(12);
    expect(keys(out)).toEqual([
      '2026-08-05',
      '2026-09-05',
      '2026-10-05',
      '2026-11-05',
      '2026-12-05',
      '2027-01-05',
      '2027-02-05',
      '2027-03-05',
      '2027-04-05',
      '2027-05-05',
      '2027-06-05',
      '2027-07-05',
    ]);
    // Meses distintos e consecutivos, sem repetir data.
    expect(new Set(keys(out)).size).toBe(12);
  });

  it('fixa o dia no último do mês quando o mês é mais curto (31 em fevereiro)', () => {
    const out = occurrencesUntil(
      { frequency: 'MONTHLY', start: { year: 2027, month: 1, day: 31 } },
      { year: 2027, month: 4, day: 30 },
    );
    expect(keys(out)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });

  it('mês bissexto: fevereiro de 2028 tem 29 dias', () => {
    const out = occurrencesUntil(
      { frequency: 'MONTHLY', start: { year: 2028, month: 1, day: 30 } },
      { year: 2028, month: 2, day: 28 },
    );
    // O horizonte 28/02 corta antes do dia 29 gerado para fevereiro.
    expect(keys(out)).toEqual(['2028-01-30']);
    const out2 = occurrencesUntil(
      { frequency: 'MONTHLY', start: { year: 2028, month: 1, day: 30 } },
      { year: 2028, month: 3, day: 1 },
    );
    expect(keys(out2)).toEqual(['2028-01-30', '2028-02-29']);
  });

  it('respeita a data final (endDate) antes do horizonte', () => {
    const out = occurrencesUntil(
      {
        frequency: 'MONTHLY',
        start: { year: 2026, month: 8, day: 10 },
        end: { year: 2026, month: 10, day: 10 },
      },
      { year: 2027, month: 8, day: 10 },
    );
    expect(keys(out)).toEqual(['2026-08-10', '2026-09-10', '2026-10-10']);
  });

  it('dayOfMonth anterior ao início pula o mês-âncora', () => {
    const out = occurrencesUntil(
      { frequency: 'MONTHLY', start: { year: 2026, month: 8, day: 20 }, dayOfMonth: 5 },
      { year: 2026, month: 11, day: 30 },
    );
    expect(keys(out)).toEqual(['2026-09-05', '2026-10-05', '2026-11-05']);
  });

  it('semanal anda de 7 em 7 dias, virando o mês', () => {
    const out = occurrencesUntil(
      { frequency: 'WEEKLY', start: { year: 2026, month: 8, day: 26 } },
      { year: 2026, month: 9, day: 20 },
    );
    expect(keys(out)).toEqual(['2026-08-26', '2026-09-02', '2026-09-09', '2026-09-16']);
  });

  it('trimestral e anual usam o passo certo', () => {
    const trimestral = occurrencesUntil(
      { frequency: 'QUARTERLY', start: { year: 2026, month: 1, day: 15 } },
      { year: 2026, month: 12, day: 31 },
    );
    expect(keys(trimestral)).toEqual(['2026-01-15', '2026-04-15', '2026-07-15', '2026-10-15']);

    const anual = occurrencesUntil(
      { frequency: 'YEARLY', start: { year: 2026, month: 3, day: 1 } },
      { year: 2029, month: 1, day: 1 },
    );
    expect(keys(anual)).toEqual(['2026-03-01', '2027-03-01', '2028-03-01']);
  });

  it('não gera nada quando o início é depois do horizonte', () => {
    const out = occurrencesUntil(
      { frequency: 'MONTHLY', start: { year: 2027, month: 1, day: 1 } },
      { year: 2026, month: 12, day: 31 },
    );
    expect(out).toEqual([]);
  });

  it('occurrencesBetween corta o passado e nextOccurrences limita a prévia', () => {
    const spec = { frequency: 'MONTHLY' as const, start: { year: 2026, month: 1, day: 8 } };
    const janela = occurrencesBetween(spec, { year: 2026, month: 5, day: 1 }, { year: 2026, month: 7, day: 31 });
    expect(keys(janela)).toEqual(['2026-05-08', '2026-06-08', '2026-07-08']);

    const previa = nextOccurrences(spec, { year: 2026, month: 8, day: 3 }, 3);
    expect(keys(previa)).toEqual(['2026-08-08', '2026-09-08', '2026-10-08']);
  });

  it('helpers de calendário', () => {
    expect(dateKeyFromParts(addDaysToParts({ year: 2026, month: 12, day: 30 }, 3))).toBe('2027-01-02');
    expect(compareDateParts({ year: 2026, month: 1, day: 2 }, { year: 2026, month: 1, day: 3 })).toBeLessThan(0);
    expect(compareDateParts({ year: 2026, month: 2, day: 1 }, { year: 2026, month: 1, day: 3 })).toBeGreaterThan(0);
    expect(compareDateParts({ year: 2026, month: 2, day: 1 }, { year: 2026, month: 2, day: 1 })).toBe(0);
  });
});
