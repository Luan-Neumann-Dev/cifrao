import { describe, expect, it } from 'vitest';
import { accountBalanceColor, accountMark, adjustmentPreview } from './accounts';
import { splitBrl } from './format';

describe('marca da conta', () => {
  it('usa a primeira letra, ignorando pontuação', () => {
    expect(accountMark('Nubank · Conta', 'CHECKING')).toBe('N');
    expect(accountMark('  inter', 'CHECKING')).toBe('I');
    expect(accountMark('99Pay', 'CHECKING')).toBe('9');
  });

  it('carteira física vira cifrão — não tem banco por trás', () => {
    expect(accountMark('Dinheiro', 'WALLET')).toBe('$');
  });

  it('nome só com símbolo não quebra', () => {
    expect(accountMark('***', 'CHECKING')).toBe('$');
  });
});

describe('cor do saldo', () => {
  it('negativo grita mesmo em corretora', () => {
    expect(accountBalanceColor('INVESTMENT', -1)).toBe('var(--negative)');
  });

  it('corretora positiva usa o token de investimento', () => {
    expect(accountBalanceColor('INVESTMENT', '6421090')).toBe('var(--invest)');
  });

  it('conta comum é texto normal', () => {
    expect(accountBalanceColor('CHECKING', '1248090')).toBe('var(--ink)');
  });
});

describe('prévia do ajuste de saldo (regra 5.8)', () => {
  it('saldo real maior gera entrada', () => {
    const p = adjustmentPreview('1248090', 1250090);
    expect(p.diffCents).toBe(2000);
    expect(p.none).toBe(false);
    expect(p.note).toBe('entrada de ajuste');
    expect(p.color).toBe('var(--positive)');
  });

  it('saldo real menor gera saída', () => {
    const p = adjustmentPreview('1248090', 1240090);
    expect(p.diffCents).toBe(-8000);
    expect(p.note).toBe('saída de ajuste');
    expect(p.color).toBe('var(--negative)');
  });

  it('saldo igual não lança nada', () => {
    const p = adjustmentPreview('1248090', 1248090);
    expect(p.none).toBe(true);
    expect(p.buttonLabel).toBe('Sem ajuste necessário');
  });

  it('campo em branco não é "está batendo"', () => {
    const p = adjustmentPreview('1248090', null);
    expect(p.none).toBe(true);
    expect(p.note).toBe('informe o saldo');
  });
});

describe('valor grande em partes', () => {
  it('separa símbolo, reais e centavos', () => {
    expect(splitBrl('1248090')).toEqual({
      sign: '',
      currency: 'R$',
      whole: '12.480',
      fraction: ',90',
    });
  });

  it('negativo sai com sinal tipográfico e módulo', () => {
    expect(splitBrl(-52000)).toEqual({
      sign: '−',
      currency: 'R$',
      whole: '520',
      fraction: ',00',
    });
  });
});
