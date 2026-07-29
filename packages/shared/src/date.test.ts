import { describe, expect, it } from 'vitest';
import {
  SP_TIMEZONE,
  formatInSaoPaulo,
  monthKeyInSaoPaulo,
  saoPauloToUtc,
} from './date';

describe('fuso America/Sao_Paulo', () => {
  it('expõe o timezone correto', () => {
    expect(SP_TIMEZONE).toBe('America/Sao_Paulo');
  });

  it('resolve o mês pelo horário de SP, não pelo UTC (armadilha da virada de fatura)', () => {
    // 2025-08-01T02:30:00Z é 2025-07-31 23:30 em SP (UTC-3) -> ainda é julho.
    expect(monthKeyInSaoPaulo(new Date('2025-08-01T02:30:00Z'))).toBe('2025-07');
    // 2025-08-01T03:30:00Z é 2025-08-01 00:30 em SP -> já é agosto.
    expect(monthKeyInSaoPaulo(new Date('2025-08-01T03:30:00Z'))).toBe('2025-08');
  });

  it('formata a data no fuso de SP', () => {
    // Meia-noite e meia UTC do dia 1 -> ainda 31 às 21:30 em SP.
    expect(formatInSaoPaulo(new Date('2025-08-01T00:30:00Z'))).toBe('31/07/2025');
    expect(formatInSaoPaulo(new Date('2025-08-01T00:30:00Z'), 'dd/MM/yyyy HH:mm')).toBe(
      '31/07/2025 21:30',
    );
  });

  it('converte parede de SP para o instante UTC correspondente (UTC-3)', () => {
    const utc = saoPauloToUtc('2025-08-01T00:00:00');
    expect(utc.toISOString()).toBe('2025-08-01T03:00:00.000Z');
  });

  it('faz round-trip parede SP -> UTC -> mês SP', () => {
    const utc = saoPauloToUtc('2025-07-31T23:59:00');
    expect(monthKeyInSaoPaulo(utc)).toBe('2025-07');
  });
});
