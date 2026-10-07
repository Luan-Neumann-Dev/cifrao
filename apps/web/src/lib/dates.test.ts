import { describe, expect, it } from 'vitest';
import {
  dayGroupLabel,
  dayKeyInSaoPaulo,
  monthLongLabel,
  monthShortLabel,
  periodRange,
} from './dates';

describe('rótulo do grupo de dia', () => {
  it('sai em português, sem depender de locale do date-fns', () => {
    expect(dayGroupLabel('2026-06-12')).toBe('Sex, 12 jun');
    expect(dayGroupLabel('2026-01-01')).toBe('Qui, 1 jan');
  });
});

describe('chave de dia no fuso de São Paulo', () => {
  it('lançamento de madrugada em UTC ainda é do dia anterior aqui', () => {
    // 2026-06-13T02:00Z = 2026-06-12 23:00 em São Paulo (UTC-3).
    expect(dayKeyInSaoPaulo('2026-06-13T02:00:00.000Z')).toBe('2026-06-12');
  });
});

describe('período do extrato', () => {
  // 2026-06-15T12:00Z = 15/06/2026 09:00 em São Paulo.
  const now = new Date('2026-06-15T12:00:00.000Z');

  it('"este mês" pega da meia-noite do dia 1 ao fim do dia 30, em SP', () => {
    const range = periodRange('month', now);
    // 00:00 de 01/06 em SP = 03:00 UTC; 23:59:59.999 de 30/06 em SP = 02:59 UTC de 01/07.
    expect(range.from).toBe('2026-06-01T03:00:00.000Z');
    expect(range.to).toBe('2026-07-01T02:59:59.999Z');
    expect(range.label).toBe('junho');
  });

  it('"mês passado" volta um mês, inclusive virando o ano', () => {
    expect(periodRange('prev', now).label).toBe('maio');
    const janeiro = new Date('2026-01-10T12:00:00.000Z');
    expect(periodRange('prev', janeiro).label).toBe('dezembro de 2025');
  });

  it('"3 meses" começa no primeiro dia de dois meses atrás', () => {
    const range = periodRange('quarter', now);
    expect(range.from).toBe('2026-04-01T03:00:00.000Z');
    expect(range.to).toBe('2026-07-01T02:59:59.999Z');
  });

  it('"tudo" não impõe limite', () => {
    expect(periodRange('all', now)).toEqual({ label: 'todo o período' });
  });
});

describe('rótulos de mês', () => {
  it('curto leva o ano em dois dígitos', () => {
    expect(monthShortLabel('2026-03')).toBe('mar/26');
  });

  it('longo só cita o ano quando não é o corrente', () => {
    expect(monthLongLabel('2026-06', 2026)).toBe('junho');
    expect(monthLongLabel('2025-06', 2026)).toBe('junho de 2025');
  });
});
