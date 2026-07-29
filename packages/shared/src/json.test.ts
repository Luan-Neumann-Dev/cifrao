import { describe, expect, it } from 'vitest';
import { bigIntReplacer, installBigIntJsonSerializer, stringifyWithBigInt } from './json';

describe('serialização de BigInt', () => {
  it('JSON.stringify puro quebra com BigInt', () => {
    expect(() => JSON.stringify({ amountCents: 12345n })).toThrow(TypeError);
  });

  it('stringifyWithBigInt serializa BigInt como string', () => {
    expect(stringifyWithBigInt({ amountCents: 12345n })).toBe('{"amountCents":"12345"}');
    expect(stringifyWithBigInt({ nested: { total: -5000n } })).toBe(
      '{"nested":{"total":"-5000"}}',
    );
  });

  it('bigIntReplacer preserva valores não-bigint', () => {
    expect(bigIntReplacer('k', 'texto')).toBe('texto');
    expect(bigIntReplacer('k', 42)).toBe(42);
    expect(bigIntReplacer('k', 42n)).toBe('42');
  });

  it('installBigIntJsonSerializer faz JSON.stringify aceitar BigInt globalmente', () => {
    installBigIntJsonSerializer();
    try {
      expect(JSON.stringify({ amountCents: 999n })).toBe('{"amountCents":"999"}');
    } finally {
      // Restaura para não vazar o patch para outros arquivos de teste.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (BigInt.prototype as any).toJSON;
    }
  });
});
