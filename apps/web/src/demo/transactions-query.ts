/**
 * Filtro da listagem de lançamentos na demo — espelho de
 * `TransactionsService.list` (apps/api). A lista inteira foi gravada; aqui se
 * aplicam os mesmos filtros, a mesma ordem e a mesma paginação, para qualquer
 * combinação que a tela pedir responder como o backend responderia.
 */

export interface DemoTransaction {
  id: string;
  type: string;
  status: string;
  date: string;
  createdAt: string;
  description: string;
  categoryId: string | null;
  creditCardId: string | null;
  paymentMethod: string | null;
  accountId: string | null;
  fromAccountId: string | null;
  toAccountId: string | null;
  tags?: { tagId?: string; tag?: { id: string } }[];
}

export interface DemoPage<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Mesma leitura do `z.coerce.date()` do filtro no backend. */
const asTime = (value: string) => new Date(value).getTime();

export function queryTransactions<T extends DemoTransaction>(
  all: readonly T[],
  params: URLSearchParams,
): DemoPage<T> {
  const type = params.get('type');
  const status = params.get('status');
  const categoryId = params.get('categoryId');
  const tagId = params.get('tagId');
  const creditCardId = params.get('creditCardId');
  const paymentMethod = params.get('paymentMethod');
  const accountId = params.get('accountId');
  const from = params.get('from');
  const to = params.get('to');
  const search = params.get('search')?.toLocaleLowerCase('pt-BR');
  const page = Math.max(1, Number(params.get('page') ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(params.get('pageSize') ?? 50) || 50));

  const filtered = all.filter((t) => {
    if (type && t.type !== type) return false;
    if (status && t.status !== status) return false;
    if (categoryId && t.categoryId !== categoryId) return false;
    if (creditCardId && t.creditCardId !== creditCardId) return false;
    if (paymentMethod && t.paymentMethod !== paymentMethod) return false;
    if (tagId && !(t.tags ?? []).some((x) => (x.tagId ?? x.tag?.id) === tagId)) return false;
    if (
      accountId &&
      t.accountId !== accountId &&
      t.fromAccountId !== accountId &&
      t.toAccountId !== accountId
    ) {
      return false;
    }
    const when = asTime(t.date);
    if (from && when < asTime(from)) return false;
    if (to && when > asTime(to)) return false;
    if (search && !t.description.toLocaleLowerCase('pt-BR').includes(search)) return false;
    return true;
  });

  // orderBy: [{ date: 'desc' }, { createdAt: 'desc' }]
  filtered.sort(
    (a, b) => asTime(b.date) - asTime(a.date) || asTime(b.createdAt) - asTime(a.createdAt),
  );

  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length,
    page,
    pageSize,
  };
}
