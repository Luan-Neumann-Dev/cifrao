import { describe, expect, it } from 'vitest';
import { formatBRL, sumCents, toCents } from './money';

describe('toCents', () => {
  it('converte inteiros em reais', () => {
    expect(toCents('1234')).toBe(123400n);
    expect(toCents('0')).toBe(0n);
  });

  it('converte formato pt-BR (ponto milhar, vírgula decimal)', () => {
    expect(toCents('1.234,56')).toBe(123456n);
    expect(toCents('0,99')).toBe(99n);
    expect(toCents('1.000.000,00')).toBe(100000000n);
  });

  it('converte formato de máquina (ponto decimal)', () => {
    expect(toCents('1234.56')).toBe(123456n);
    expect(toCents('0.5')).toBe(50n);
  });

  it('ignora símbolo e espaços', () => {
    expect(toCents('R$ 1.234,56')).toBe(123456n);
    expect(toCents(' R$  99,90 ')).toBe(9990n);
  });

  it('trata negativos por hífen ou parênteses', () => {
    expect(toCents('-50,00')).toBe(-5000n);
    expect(toCents('(50,00)')).toBe(-5000n);
    expect(toCents('-R$ 1.234,56')).toBe(-123456n);
  });

  it('arredonda meio para cima no terceiro dígito', () => {
    expect(toCents('1,235')).toBe(124n);
    expect(toCents('1,234')).toBe(123n);
    expect(toCents('1,2349')).toBe(123n);
  });

  it('aceita number e arredonda', () => {
    expect(toCents(1234.56)).toBe(123456n);
    expect(toCents(0.1 + 0.2)).toBe(30n); // 0.30000000000000004 -> 30
  });

  it('rejeita entradas inválidas', () => {
    expect(() => toCents('')).toThrow();
    expect(() => toCents('abc')).toThrow();
    expect(() => toCents('1.2.3')).toThrow();
    expect(() => toCents(Number.NaN)).toThrow();
  });
});

describe('formatBRL', () => {
  it('formata centavos como BRL', () => {
    expect(formatBRL(123456n)).toBe('R$ 1.234,56');
    expect(formatBRL(99n)).toBe('R$ 0,99');
    expect(formatBRL(0n)).toBe('R$ 0,00');
    expect(formatBRL(100000000n)).toBe('R$ 1.000.000,00');
  });

  it('formata valores negativos', () => {
    expect(formatBRL(-5000n)).toBe('-R$ 50,00');
  });

  it('aceita number', () => {
    expect(formatBRL(5000)).toBe('R$ 50,00');
  });
});

describe('sumCents', () => {
  it('soma preservando precisão de bigint', () => {
    expect(sumCents(100n, 200n, 300n)).toBe(600n);
    expect(sumCents()).toBe(0n);
    expect(sumCents(-100n, 250n)).toBe(150n);
  });

  it('é o inverso de toCents num round-trip', () => {
    const total = sumCents(toCents('1.234,56'), toCents('0,44'));
    expect(formatBRL(total)).toBe('R$ 1.235,00');
  });
});
