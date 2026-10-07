import { describe, expect, it } from 'vitest';
import { type DemoTransaction, queryTransactions } from './transactions-query';

function tx(id: string, over: Partial<DemoTransaction> = {}): DemoTransaction {
  return {
    id,
    type: 'EXPENSE',
    status: 'CLEARED',
    date: '2026-10-05T15:00:00.000Z',
    createdAt: '2026-10-07T12:00:00.000Z',
    description: id,
    categoryId: null,
    creditCardId: null,
    paymentMethod: null,
    accountId: 'conta',
    fromAccountId: null,
    toAccountId: null,
    tags: [],
    ...over,
  };
}

const q = (all: DemoTransaction[], params: Record<string, string>) =>
  queryTransactions(all, new URLSearchParams(params));

describe('listagem de lançamentos da demo (espelho do backend)', () => {
  it('ordena por data desc e, no empate, pelo mais recente criado', () => {
    const all = [
      tx('velho', { date: '2026-09-01T12:00:00Z' }),
      tx('empate-1', { createdAt: '2026-10-07T10:00:00Z' }),
      tx('empate-2', { createdAt: '2026-10-07T11:00:00Z' }),
    ];
    expect(q(all, {}).items.map((t) => t.id)).toEqual(['empate-2', 'empate-1', 'velho']);
  });

  it('conta: casa a conta do lançamento e as duas pontas da transferência', () => {
    const all = [
      tx('gasto', { accountId: 'c1' }),
      tx('saiu', { type: 'TRANSFER', accountId: null, fromAccountId: 'c1', toAccountId: 'c2' }),
      tx('entrou', { type: 'TRANSFER', accountId: null, fromAccountId: 'c3', toAccountId: 'c1' }),
      tx('outra', { accountId: 'c9' }),
    ];
    expect(q(all, { accountId: 'c1' }).total).toBe(3);
  });

  it('período, tipo, tag e busca sem diferenciar maiúsculas', () => {
    const all = [
      tx('a', { description: 'iFood pedido', tags: [{ tagId: 'viagem' }] }),
      tx('b', { description: 'IFOOD', date: '2026-08-01T12:00:00Z' }),
      tx('c', { description: 'Salário', type: 'INCOME' }),
    ];
    expect(q(all, { search: 'ifood' }).total).toBe(2);
    expect(q(all, { search: 'ifood', from: '2026-10-01' }).items.map((t) => t.id)).toEqual(['a']);
    expect(q(all, { type: 'INCOME' }).items.map((t) => t.id)).toEqual(['c']);
    expect(q(all, { tagId: 'viagem' }).items.map((t) => t.id)).toEqual(['a']);
  });

  it('pagina como o backend, com o total do filtro inteiro', () => {
    const all = Array.from({ length: 7 }, (_, i) =>
      tx(`t${i}`, { date: `2026-10-0${i + 1}T12:00:00Z` }),
    );
    const page = q(all, { page: '2', pageSize: '3' });
    expect(page.total).toBe(7);
    expect(page.items.map((t) => t.id)).toEqual(['t3', 't2', 't1']);
  });
});
