import { describe, expect, it } from 'vitest';
import { assignLanes } from './ruler-lanes';

const span = (center: number, width = 10) => ({
  start: center - width / 2,
  end: center + width / 2,
});

describe('faixas dos rótulos da régua do mês', () => {
  it('rótulos distantes ficam todos na primeira faixa', () => {
    expect(assignLanes([span(10), span(40), span(80)])).toEqual([0, 0, 0]);
  });

  it('dois vencimentos no mesmo dia vão para faixas diferentes', () => {
    // Aluguel e Condomínio no dia 10: o caso que se atropelava.
    expect(assignLanes([span(30), span(30)])).toEqual([0, 1]);
  });

  it('volta para a primeira faixa assim que há espaço de novo', () => {
    expect(assignLanes([span(10), span(14), span(18), span(60)])).toEqual([0, 1, 2, 0]);
  });

  it('a resposta segue a ordem recebida, não a ordem na régua', () => {
    expect(assignLanes([span(50), span(10), span(52)])).toEqual([0, 0, 1]);
  });

  it('o marcador de HOJE empurra para cima quem cai em cima dele', () => {
    expect(assignLanes([span(20), span(60)], [span(22, 6)])).toEqual([1, 0]);
  });

  it('encostar não é sobrepor', () => {
    expect(
      assignLanes([
        { start: 0, end: 10 },
        { start: 10, end: 20 },
      ]),
    ).toEqual([0, 0]);
  });
});
