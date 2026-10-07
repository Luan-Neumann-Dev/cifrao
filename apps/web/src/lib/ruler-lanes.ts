/** Trecho horizontal ocupado por um rótulo, na mesma unidade de todos os outros. */
export interface Span {
  start: number;
  end: number;
}

const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

/**
 * Faixas de altura para rótulos que não podem se sobrepor na horizontal.
 *
 * Varre da esquerda para a direita e põe cada rótulo na faixa mais baixa em que
 * ele cabe; se não cabe em nenhuma, abre uma faixa nova acima. `reserved` ocupa
 * a primeira faixa (ex.: o marcador de HOJE), empurrando para cima quem cair
 * em cima dele. Devolve a faixa de cada span, na ordem recebida.
 */
export function assignLanes(spans: readonly Span[], reserved: readonly Span[] = []): number[] {
  const lanes: Span[][] = [[...reserved]];
  const result = new Array<number>(spans.length).fill(0);
  const order = spans.map((_, i) => i).sort((a, b) => spans[a].start - spans[b].start);

  for (const i of order) {
    let lane = lanes.findIndex((taken) => taken.every((s) => !overlaps(s, spans[i])));
    if (lane === -1) {
      lane = lanes.length;
      lanes.push([]);
    }
    lanes[lane].push(spans[i]);
    result[i] = lane;
  }
  return result;
}
