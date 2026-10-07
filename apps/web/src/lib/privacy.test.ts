import { describe, expect, it } from 'vitest';
import { brl, brlShort, splitBrl } from './format';
import { MASK, maskMoney } from './privacy';

describe('modo privacidade', () => {
  it('esconde o número mas mantém o R$ — a linha não muda de forma', () => {
    expect(maskMoney(true, brl('1248090'))).toBe(`R$ ${MASK}`);
  });

  it('desligado, não mexe em nada', () => {
    expect(maskMoney(false, brl('1248090'))).toBe('R$ 12.480,90');
  });

  it('vale também para o formato curto do gráfico', () => {
    expect(maskMoney(true, brlShort('184490'))).toBe(`R$ ${MASK}`);
  });

  it('valor negativo continua reconhecível como negativo', () => {
    // O sinal fica: esconder quanto é uma coisa, esconder que está no vermelho
    // é outra.
    expect(maskMoney(true, brl(-52000))).toBe(`-R$ ${MASK}`);
  });

  it('o valor grande em partes também dá para mascarar', () => {
    const parts = splitBrl('1248090');
    expect(maskMoney(true, parts.whole)).toBe(MASK);
  });
});
