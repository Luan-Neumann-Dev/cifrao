import { type DemoTransaction, queryTransactions } from './transactions-query';

/**
 * A `api()` da demonstração. Responde com o que a API de verdade respondeu na
 * gravação (`scripts/record-demo.mjs`) — nenhum número aqui é inventado.
 *
 * - GET gravado: devolvido como foi gravado.
 * - Listagem de lançamentos: filtrada em memória com as regras do backend.
 * - Qualquer escrita: recusada com uma mensagem que a tela mostra no toast de
 *   erro que ela já tem. Nenhuma tela precisa saber que existe demo.
 */

export const DEMO_READ_ONLY =
  'Isto é uma demonstração: nada é salvo. Para usar de verdade, rode a versão completa — o link está no topo.';
const DEMO_MISSING = 'Fora do período com dados nesta demonstração.';

interface Fixtures {
  responses: Record<string, unknown>;
  transactions: DemoTransaction[];
}

let fixtures: Promise<Fixtures> | null = null;

/** Carregado sob demanda, uma vez: ~100 KB comprimidos, só no build da demo. */
function load(): Promise<Fixtures> {
  fixtures ??= Promise.all([
    import('./fixtures/responses.json'),
    import('./fixtures/transactions.json'),
  ]).then(([responses, transactions]) => ({
    responses: responses.default as Record<string, unknown>,
    transactions: transactions.default as unknown as DemoTransaction[],
  }));
  return fixtures;
}

/** Cópia: a tela pode mexer no objeto sem estragar a próxima resposta. */
const fresh = <T>(value: unknown): T => structuredClone(value) as T;

export async function demoApi<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? 'GET').toUpperCase();
  if (method !== 'GET') throw new Error(DEMO_READ_ONLY);

  const { responses, transactions } = await load();
  if (path in responses) return fresh<T>(responses[path]);

  const url = new URL(path, 'http://demo.local');
  const route = url.pathname;

  if (route === '/transactions') {
    return fresh<T>(queryTransactions(transactions, url.searchParams));
  }

  const byId = route.match(/^\/transactions\/([^/]+)(\/splits)?$/);
  if (byId) {
    const tx = transactions.find((t) => t.id === byId[1]);
    if (tx && !byId[2]) return fresh<T>(tx);
    // Só os divididos foram gravados; os demais não têm divisão.
    if (tx) return { transactionId: tx.id, splits: [] } as T;
  }

  // Importação: o "N lançamentos com esse padrão" e o lote com outro tamanho
  // de página não foram gravados um a um.
  if (/^\/imports\/[^/]+\/pattern$/.test(route)) {
    return { count: 0, pattern: url.searchParams.get('pattern') ?? '' } as T;
  }
  const batch = route.match(/^\/imports\/([^/]+)$/);
  if (batch && `/imports/${batch[1]}?pageSize=500` in responses) {
    return fresh<T>(responses[`/imports/${batch[1]}?pageSize=500`]);
  }

  if (route === '/categories/sugestao') return null as T;

  throw new Error(DEMO_MISSING);
}
