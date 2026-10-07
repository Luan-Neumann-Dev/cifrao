/**
 * Bateria de teste cruzado — usuário A × usuário B, contra a API de verdade.
 *
 * É a rede de segurança do isolamento por usuário: o compilador não acusa
 * leitura sem `userId`, e a varredura de queries é heurística. Aqui A monta um
 * conjunto completo de dados com um MARCADOR único no texto, e B tenta tudo:
 * listar, ler por id, alterar, apagar, referenciar o dado de A nos próprios
 * lançamentos, restaurar um backup forjado e acionar a zona de risco.
 *
 * Três redes pegam o vazamento sem depender de saber onde ele está:
 *  1. Nenhuma resposta que B recebe contém o marcador nem qualquer id de A.
 *  2. Enquanto B não tem dado nenhum, todo campo `*Cents` que ele vê é zero —
 *     pega soma que mistura dinheiro alheio mesmo sem expor texto.
 *  3. Uma foto das telas de A, tirada antes dos ataques, continua idêntica
 *     depois de cada rodada.
 *
 * Como rodar (banco DESCARTÁVEL — a zona de risco de B roda de verdade):
 *   1. crie o banco `cifrao_e2e`, aplique as migrações e o seed de categorias;
 *   2. suba web e API apontando para ele, com o cadastro aberto e o rate limit
 *      desligado SÓ nesse processo:
 *        DATABASE_URL=…/cifrao_e2e DIRECT_URL=…/cifrao_e2e \
 *        REGISTRATION_OPEN=true AUTH_RATE_LIMIT=false pnpm dev
 *   3. pnpm --filter @cifrao/api test:e2e
 * `E2E_WEB_URL` / `E2E_API_URL` trocam os endereços (padrão 3000 / 3001).
 */
import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const WEB = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API = process.env.E2E_API_URL ?? 'http://localhost:3001';

const RUN = randomBytes(4).toString('hex');
/** Marcador que só existe no dado de A. Aparecer para B é vazamento. */
const MARK = `ALFA${RUN}`;

interface User {
  id: string;
  email: string;
  token: string;
}

interface Res {
  status: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json: any;
}

async function signUp(label: string): Promise<User> {
  const email = `e2e-${label}-${RUN}@cifrao.test`;
  const password = randomBytes(18).toString('base64url');
  const res = await fetch(`${WEB}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({ email, password, name: `E2E ${label}` }),
  });
  if (!res.ok) throw new Error(`cadastro de ${label} falhou: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const tokenRes = await fetch(`${WEB}/api/auth/token`, { headers: { cookie } });
  const { token } = (await tokenRes.json()) as { token: string };
  const me = await call({ id: '', email, token }, 'GET', '/me');
  return { id: me.json.user.id, email, token };
}

async function call(user: User, method: string, path: string, body?: unknown): Promise<Res> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${user.token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // CSV e afins: fica só o texto.
  }
  return { status: res.status, text, json };
}

/** Chamada que TEM que dar certo — monta o cenário. */
async function ok(user: User, method: string, path: string, body?: unknown) {
  const res = await call(user, method, path, body);
  if (res.status >= 300) {
    throw new Error(`${method} ${path} → ${res.status}: ${res.text.slice(0, 400)}`);
  }
  return res.json;
}

function walk(value: unknown, visit: (key: string, v: unknown) => void, key = ''): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, key);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      visit(k, v);
      walk(v, visit, k);
    }
  }
}

/** Todo id que aparece numa resposta (campo `id` ou `…Id`). */
function idsIn(value: unknown): Set<string> {
  const ids = new Set<string>();
  walk(value, (k, v) => {
    if (typeof v === 'string' && v.length >= 16 && (k === 'id' || k.endsWith('Id'))) ids.add(v);
  });
  return ids;
}

/** Campos de dinheiro diferentes de zero — com B vazio, não devia haver nenhum. */
function nonZeroCents(value: unknown): string[] {
  const found: string[] = [];
  walk(value, (k, v) => {
    if (!k.endsWith('Cents') || v === null || v === undefined) return;
    if (typeof v === 'object') return;
    if (String(v) !== '0') found.push(`${k}=${String(v)}`);
  });
  return found;
}

function waitFor<T>(fn: () => Promise<T | null>, what: string, tries = 60): Promise<T> {
  return (async () => {
    for (let i = 0; i < tries; i++) {
      const result = await fn();
      if (result) return result;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`tempo esgotado esperando ${what}`);
  })();
}

const today = new Date();
const todayIso = today.toISOString();
const monthKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
})
  .format(today)
  .slice(0, 7);

let A: User;
let B: User;
/** Ids de A, por nome, para os ataques dirigidos. */
const a: Record<string, string> = {};
/** Todo id de A visto nas telas dele (menos as categorias universais). */
let aIds = new Set<string>();
let universalIds = new Set<string>();
let snapshotBefore = new Map<string, string>();

/** As telas de A cujo conteúdo não pode mudar por ação de B. */
function snapshotPaths(): string[] {
  return [
    '/accounts',
    `/accounts/${a.acc1}`,
    `/accounts/${a.acc2}`,
    '/transactions?pageSize=200',
    `/transactions/${a.txE}`,
    `/transactions/${a.txE}/splits`,
    '/categories',
    '/tags',
    '/credit-cards',
    `/credit-cards/${a.card}`,
    `/invoices/${a.invoice}`,
    `/purchases/${a.purchase}`,
    `/budgets?month=${monthKey}`,
    '/goals',
    '/recurring-rules',
    `/recurring-rules/${a.recurring}`,
    '/category-rules',
    '/imports',
    `/imports/${a.batch}`,
    '/investments/list',
    `/investments/${a.investment}`,
    '/receivables',
    `/reports/revisao?month=${monthKey}`,
    '/backup/resumo',
  ];
}

async function snapshotA(): Promise<Map<string, string>> {
  const snap = new Map<string, string>();
  for (const path of snapshotPaths()) {
    const res = await call(A, 'GET', path);
    expect(res.status, `A perdeu acesso a ${path}`).toBe(200);
    snap.set(path, res.text);
  }
  return snap;
}

async function expectAUntouched(after: string) {
  const now = await snapshotA();
  for (const [path, before] of snapshotBefore) {
    expect(now.get(path), `${path} de A mudou depois de: ${after}`).toBe(before);
  }
}

function expectNoLeak(label: string, res: Res) {
  expect(res.status, `${label} → ${res.status}: ${res.text.slice(0, 300)}`).toBeLessThan(500);
  const lower = res.text.toLowerCase();
  expect(lower.includes(MARK.toLowerCase()), `${label} mostrou o marcador de A`).toBe(false);
  expect(res.text.includes(A.id), `${label} mostrou o id do usuário A`).toBe(false);
  const leaked = [...aIds].filter((id) => res.text.includes(id));
  expect(leaked, `${label} mostrou ids de A`).toEqual([]);
}

/** Recusa esperada: 4xx. 2xx é vazamento; 5xx é bug (e às vezes vazamento). */
function expectRefused(label: string, res: Res) {
  expect(
    res.status >= 400 && res.status < 500,
    `${label} devia ser recusado, veio ${res.status}: ${res.text.slice(0, 300)}`,
  ).toBe(true);
  expectNoLeak(label, res);
}

const OFX = (lines: string[]) =>
  `OFXHEADER:100
DATA:OFXSGML
VERSION:102
CHARSET:1252

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>
<BANKACCTFROM><BANKID>001<ACCTID>${RUN}-9<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
${lines.join('\n')}
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

beforeAll(async () => {
  A = await signUp('a');
  B = await signUp('b');

  // Categorias universais são de todo mundo: B vê-las não é vazamento.
  universalIds = idsIn((await ok(B, 'GET', '/categories')) as unknown);

  // ── A monta um conjunto completo de dados ────────────────────────────────
  a.acc1 = (await ok(A, 'POST', '/accounts', {
    name: `${MARK} Corrente`,
    type: 'CHECKING',
    initialBalanceCents: 100000,
  })).id;
  a.acc2 = (await ok(A, 'POST', '/accounts', {
    name: `${MARK} Poupança`,
    type: 'SAVINGS',
    initialBalanceCents: 50000,
  })).id;
  a.cat = (await ok(A, 'POST', '/categories', { name: MARK, kind: 'EXPENSE' })).id;
  a.tag = (await ok(A, 'POST', '/tags', { name: MARK })).id;
  a.universalCat = [...universalIds][0];

  a.txE = (await ok(A, 'POST', '/transactions', {
    type: 'EXPENSE',
    accountId: a.acc1,
    amountCents: 10000,
    date: todayIso,
    description: `${MARK} almoço`,
    categoryId: a.cat,
    tagIds: [a.tag],
    isReimbursable: true,
    paymentMethod: 'PIX',
  })).id;
  a.txI = (await ok(A, 'POST', '/transactions', {
    type: 'INCOME',
    accountId: a.acc1,
    amountCents: 500000,
    date: todayIso,
    description: `${MARK} salário`,
  })).id;
  a.txT = (await ok(A, 'POST', '/transactions', {
    type: 'TRANSFER',
    fromAccountId: a.acc1,
    toAccountId: a.acc2,
    amountCents: 20000,
    date: todayIso,
    description: `${MARK} reserva`,
  })).id;
  await ok(A, 'POST', `/accounts/${a.acc2}/adjust`, { realBalanceCents: 80000 });
  await ok(A, 'PUT', `/transactions/${a.txE}/splits`, {
    splits: [
      { categoryId: a.cat, amountCents: 6000 },
      { categoryId: a.universalCat, amountCents: 4000 },
    ],
  });
  await ok(A, 'POST', `/transactions/${a.txE}/reimburse`, { accountId: a.acc1, amountCents: 3000 });

  a.card = (await ok(A, 'POST', '/credit-cards', {
    nickname: MARK,
    limitCents: 500000,
    closingDay: 28,
    dueDay: 5,
    last4: '4321',
    defaultPaymentAccountId: a.acc1,
  })).id;
  const purchase = await ok(A, 'POST', `/credit-cards/${a.card}/purchases`, {
    amountCents: 60000,
    date: todayIso,
    description: `${MARK} notebook`,
    installments: 6,
    categoryId: a.cat,
  });
  a.purchase = purchase.purchaseId;
  a.invoice = purchase.invoiceIds[0];
  await ok(A, 'POST', `/invoices/${a.invoice}/pay`, { accountId: a.acc1, amountCents: 1000 });

  a.budget = (await ok(A, 'PUT', '/budgets', {
    categoryId: a.cat,
    month: monthKey,
    limitCents: 50000,
  })).id;
  a.goal = (await ok(A, 'POST', '/goals', {
    name: MARK,
    targetCents: 1000000,
    linkedAccountId: a.acc2,
  })).id;
  const recurring = await ok(A, 'POST', '/recurring-rules', {
    type: 'EXPENSE',
    accountId: a.acc1,
    categoryId: a.cat,
    description: `${MARK} aluguel`,
    amountCents: 150000,
    frequency: 'MONTHLY',
    startDate: todayIso,
  });
  a.recurring = recurring.id ?? recurring.rule?.id;
  a.rule = (await ok(A, 'POST', '/category-rules', {
    pattern: `${MARK} padaria`,
    categoryId: a.cat,
  })).id;

  a.investment = (await ok(A, 'POST', '/investments', {
    ticker: `A${RUN}`,
    name: MARK,
    class: 'STOCKS',
  })).id;
  const trade = await ok(A, 'POST', `/investments/${a.investment}/contribute`, {
    quantity: '10',
    priceCents: 2000,
    date: todayIso,
    accountId: a.acc1,
  });
  a.trade = trade.trade.id;
  await ok(A, 'PATCH', `/investments/${a.investment}/price`, { priceCents: 2500 });
  await ok(A, 'PUT', '/investments/targets', { targets: [{ class: 'STOCKS', targetPercent: 60 }] });

  const upload = await ok(A, 'POST', '/imports', {
    filename: 'extrato.ofx',
    accountId: a.acc1,
    contentBase64: Buffer.from(
      OFX([
        `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260310120000[-3:BRT]<TRNAMT>-45.90<FITID>${RUN}-1<MEMO>${MARK} PADARIA</STMTTRN>`,
        `<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260311120000[-3:BRT]<TRNAMT>-12.00<FITID>${RUN}-2<MEMO>${MARK} CAFE</STMTTRN>`,
      ]),
    ).toString('base64'),
  });
  a.batch = upload.id;
  const batch = await waitFor(async () => {
    const res = await ok(A, 'GET', `/imports/${a.batch}`);
    return res.status === 'REVIEW' || res.batch?.status === 'REVIEW' ? res : null;
  }, 'a importação de A chegar à revisão');
  walk(batch, (k, v) => {
    if (k === 'rows' && Array.isArray(v) && v[0]?.id) a.importRow = v[0].id;
  });

  await ok(A, 'PATCH', '/settings/profile', { name: MARK });
  await ok(A, 'POST', '/settings/onboarding/concluir');

  for (const [name, id] of Object.entries(a)) {
    if (!id) throw new Error(`cenário de A incompleto: faltou ${name}`);
  }

  snapshotBefore = await snapshotA();
  for (const text of snapshotBefore.values()) {
    try {
      for (const id of idsIn(JSON.parse(text))) aIds.add(id);
    } catch {
      // não-JSON
    }
  }
  for (const id of Object.values(a)) aIds.add(id);
  aIds = new Set([...aIds].filter((id) => !universalIds.has(id) && id !== B.id));
  // Sanidade: a rede só pega vazamento se A tiver dado de verdade.
  expect(aIds.size).toBeGreaterThan(20);
});

afterAll(async () => {
  // Limpeza: A sai pela própria zona de risco. B já saiu no último teste.
  if (A) await call(A, 'DELETE', '/backup/conta', { confirm: 'EXCLUIR MINHA CONTA' });
});

describe('isolamento por usuário — A × B na API real', () => {
  it('B não enxerga nada de A em listagens, agregados e exportações', async () => {
    const reads = [
      '/me',
      '/accounts',
      '/categories',
      '/categories/uso',
      `/categories/sugestao?description=${encodeURIComponent(`${MARK} padaria`)}`,
      '/tags',
      '/transactions?pageSize=200',
      `/transactions?accountId=${a.acc1}`,
      `/transactions?categoryId=${a.cat}`,
      `/transactions?tagId=${a.tag}`,
      `/transactions?creditCardId=${a.card}`,
      `/transactions?search=${MARK}`,
      '/credit-cards',
      `/dashboard?month=${monthKey}`,
      '/calendar',
      '/receivables',
      '/reports',
      `/reports?accountId=${a.acc1}`,
      `/reports/revisao?month=${monthKey}`,
      ...['categorias', 'lancamentos', 'serie', 'estabelecimentos'].map(
        (s) => `/reports/export?section=${s}`,
      ),
      `/budgets?month=${monthKey}`,
      `/budgets/suggestions?month=${monthKey}`,
      '/goals',
      '/recurring-rules',
      '/recurring-rules/forecasts',
      '/category-rules',
      `/category-rules/test?description=${encodeURIComponent(`${MARK} padaria`)}`,
      '/imports',
      '/investments',
      '/investments/list',
      '/notifications',
      '/settings',
      '/settings/onboarding',
      '/settings/sessions',
      '/backup/resumo',
      '/backup/exportar.json',
      ...[
        'lancamentos',
        'contas',
        'cartoes',
        'faturas',
        'categorias',
        'orcamentos',
        'metas',
        'recorrencias',
        'investimentos',
        'operacoes',
      ].map((s) => `/backup/exportar.csv?section=${s}`),
    ];

    for (const path of reads) {
      const res = await call(B, 'GET', path);
      expectNoLeak(`B GET ${path}`, res);
      if (res.json) {
        expect(nonZeroCents(res.json), `B GET ${path} somou dinheiro que não é dele`).toEqual([]);
      }
    }

    // O primeiro-passos de B olha só para B: ele ainda não tem conta nenhuma.
    const onboarding = await call(B, 'GET', '/settings/onboarding');
    expect(onboarding.json.needsOnboarding).toBe(true);
  });

  it('B não lê registro de A pelo id', async () => {
    const reads = [
      `/accounts/${a.acc1}`,
      `/accounts/${a.acc1}/balance-evolution`,
      `/transactions/${a.txE}`,
      `/transactions/${a.txE}/splits`,
      `/credit-cards/${a.card}`,
      `/credit-cards/${a.card}/commitment`,
      `/invoices/${a.invoice}`,
      `/purchases/${a.purchase}`,
      `/recurring-rules/${a.recurring}`,
      `/imports/${a.batch}`,
      `/imports/${a.batch}/pattern?pattern=padaria`,
      `/investments/${a.investment}`,
    ];
    for (const path of reads) expectRefused(`B GET ${path}`, await call(B, 'GET', path));
  });

  it('B não altera nem apaga dado de A pelo id', async () => {
    const writes: [string, string, unknown?][] = [
      ['PATCH', `/accounts/${a.acc1}`, { name: 'invadida' }],
      ['POST', `/accounts/${a.acc1}/adjust`, { realBalanceCents: 1 }],
      ['DELETE', `/accounts/${a.acc2}`],
      ['PATCH', `/categories/${a.cat}`, { name: 'invadida' }],
      ['POST', `/categories/${a.cat}/mesclar`, { targetId: a.universalCat }],
      ['DELETE', `/categories/${a.cat}`],
      // Categoria universal é de todos: ninguém edita nem apaga pela API.
      ['PATCH', `/categories/${a.universalCat}`, { name: 'invadida' }],
      ['DELETE', `/categories/${a.universalCat}`],
      ['DELETE', `/tags/${a.tag}`],
      ['PATCH', `/transactions/${a.txE}`, { description: 'invadida' }],
      ['POST', `/transactions/${a.txE}/reimburse`, { accountId: a.acc1 }],
      ['DELETE', `/transactions/${a.txE}/reimburse`],
      ['PUT', `/transactions/${a.txE}/splits`, { splits: [] }],
      ['DELETE', `/transactions/${a.txI}`],
      ['DELETE', `/transactions/${a.txT}`],
      ['PATCH', `/credit-cards/${a.card}`, { nickname: 'invadido' }],
      [
        'POST',
        `/credit-cards/${a.card}/purchases`,
        { amountCents: 100, date: todayIso, description: 'invasão' },
      ],
      ['DELETE', `/credit-cards/${a.card}`],
      ['POST', `/invoices/${a.invoice}/pay`, { accountId: a.acc1, amountCents: 100 }],
      ['DELETE', `/budgets/${a.budget}`],
      ['PATCH', `/goals/${a.goal}`, { name: 'invadida' }],
      ['DELETE', `/goals/${a.goal}`],
      ['PATCH', `/recurring-rules/${a.recurring}`, { description: 'invadida' }],
      ['POST', `/recurring-rules/${a.recurring}/generate`],
      ['DELETE', `/recurring-rules/${a.recurring}`],
      ['PATCH', `/category-rules/${a.rule}`, { active: false }],
      ['DELETE', `/category-rules/${a.rule}`],
      ['PATCH', `/imports/${a.batch}/account`, { accountId: a.acc2 }],
      [
        'PATCH',
        `/imports/${a.batch}/mapping`,
        { date: 'Data', description: 'Desc', amount: 'Valor' },
      ],
      ['PATCH', `/imports/${a.batch}/rows/${a.importRow}`, { status: 'IGNORED' }],
      ['POST', `/imports/${a.batch}/apply-pattern`, { pattern: 'padaria', categoryId: a.cat }],
      ['POST', `/imports/${a.batch}/confirm`],
      ['DELETE', `/imports/${a.batch}`],
      ['PATCH', `/investments/${a.investment}`, { name: 'invadida' }],
      ['PATCH', `/investments/${a.investment}/price`, { priceCents: 1 }],
      [
        'POST',
        `/investments/${a.investment}/contribute`,
        { quantity: '1', priceCents: 1, date: todayIso },
      ],
      [
        'POST',
        `/investments/${a.investment}/redeem`,
        { quantity: '1', priceCents: 1, date: todayIso },
      ],
      ['DELETE', `/investments/${a.investment}/trades/${a.trade}`],
      ['DELETE', `/investments/${a.investment}`],
    ];
    for (const [method, path, body] of writes) {
      expectRefused(`B ${method} ${path}`, await call(B, method, path, body));
    }

    // Lote: os ids vêm no corpo — era o furo mais perigoso antes do escopo.
    const ids = [a.txE, a.txI, a.txT];
    for (const body of [
      { action: 'categorize', ids, categoryId: a.universalCat },
      { action: 'setStatus', ids, status: 'PENDING' },
      { action: 'addTag', ids, tagId: a.tag },
      { action: 'delete', ids },
    ]) {
      const res = await call(B, 'POST', '/transactions/bulk', body);
      expectNoLeak(`B bulk ${body.action}`, res);
    }

    // Ações "globais" de B não podem alcançar A.
    for (const [method, path, body] of [
      ['POST', '/recurring-rules/generate', undefined],
      ['PUT', '/investments/targets', { targets: [] }],
      ['DELETE', '/settings/sessions/outras', undefined],
    ] as [string, string, unknown][]) {
      expectNoLeak(`B ${method} ${path}`, await call(B, method, path, body));
    }

    await expectAUntouched('ataques de B pelo id');
  });

  it('B não referencia conta, categoria, tag ou cartão de A no próprio dado', async () => {
    const accB = (await ok(B, 'POST', '/accounts', {
      name: 'B Corrente',
      type: 'CHECKING',
      initialBalanceCents: 1000,
    })).id;
    const txB = (await ok(B, 'POST', '/transactions', {
      type: 'EXPENSE',
      accountId: accB,
      amountCents: 500,
      date: todayIso,
      description: 'gasto de B',
      isReimbursable: true,
    })).id;
    const cardB = (await ok(B, 'POST', '/credit-cards', {
      nickname: 'Cartão B',
      limitCents: 10000,
      closingDay: 10,
      dueDay: 20,
    })).id;
    const purchaseB = await ok(B, 'POST', `/credit-cards/${cardB}/purchases`, {
      amountCents: 1000,
      date: todayIso,
      description: 'compra de B',
    });
    const invB = (await ok(B, 'POST', '/investments', { ticker: `B${RUN}`, class: 'STOCKS' })).id;
    const catB = (await ok(B, 'POST', '/categories', { name: 'Categoria B', kind: 'EXPENSE' })).id;
    const expense = (extra: object) => ({
      type: 'EXPENSE',
      accountId: accB,
      amountCents: 100,
      date: todayIso,
      description: 'tentativa',
      ...extra,
    });

    const attempts: [string, string, unknown][] = [
      ['POST', '/transactions', expense({ accountId: a.acc1 })],
      ['POST', '/transactions', expense({ categoryId: a.cat })],
      ['POST', '/transactions', expense({ tagIds: [a.tag] })],
      [
        'POST',
        '/transactions',
        {
          type: 'TRANSFER',
          fromAccountId: accB,
          toAccountId: a.acc1,
          amountCents: 100,
          date: todayIso,
          description: 'tentativa',
        },
      ],
      [
        'POST',
        '/transactions',
        {
          type: 'TRANSFER',
          fromAccountId: a.acc1,
          toAccountId: accB,
          amountCents: 100,
          date: todayIso,
          description: 'tentativa',
        },
      ],
      ['PATCH', `/transactions/${txB}`, { categoryId: a.cat }],
      ['PATCH', `/transactions/${txB}`, { tagIds: [a.tag] }],
      ['POST', `/transactions/${txB}/reimburse`, { accountId: a.acc1 }],
      [
        'PUT',
        `/transactions/${txB}/splits`,
        {
          splits: [
            { categoryId: a.cat, amountCents: 250 },
            { categoryId: catB, amountCents: 250 },
          ],
        },
      ],
      ['POST', '/transactions/bulk', { action: 'categorize', ids: [txB], categoryId: a.cat }],
      ['POST', '/transactions/bulk', { action: 'addTag', ids: [txB], tagId: a.tag }],
      ['POST', '/categories', { name: 'filha', parentId: a.cat }],
      ['PATCH', `/categories/${catB}`, { parentId: a.cat }],
      ['POST', `/categories/${catB}/mesclar`, { targetId: a.cat }],
      [
        'POST',
        '/credit-cards',
        { nickname: 'x', limitCents: 100, closingDay: 1, dueDay: 2, defaultPaymentAccountId: a.acc1 },
      ],
      ['PATCH', `/credit-cards/${cardB}`, { defaultPaymentAccountId: a.acc1 }],
      [
        'POST',
        `/credit-cards/${cardB}/purchases`,
        { amountCents: 100, date: todayIso, description: 'x', categoryId: a.cat },
      ],
      ['POST', `/invoices/${purchaseB.invoiceIds[0]}/pay`, { accountId: a.acc1, amountCents: 100 }],
      ['PUT', '/budgets', { categoryId: a.cat, month: monthKey, limitCents: 100 }],
      ['POST', '/goals', { name: 'meta B', targetCents: 100, linkedAccountId: a.acc2 }],
      [
        'POST',
        '/recurring-rules',
        {
          type: 'EXPENSE',
          accountId: a.acc1,
          description: 'x',
          amountCents: 100,
          frequency: 'MONTHLY',
          startDate: todayIso,
        },
      ],
      [
        'POST',
        '/recurring-rules',
        {
          type: 'EXPENSE',
          accountId: accB,
          categoryId: a.cat,
          description: 'x',
          amountCents: 100,
          frequency: 'MONTHLY',
          startDate: todayIso,
        },
      ],
      ['POST', '/category-rules', { pattern: 'qualquer', categoryId: a.cat }],
      [
        'POST',
        '/imports',
        {
          filename: 'x.ofx',
          accountId: a.acc1,
          contentBase64: Buffer.from(OFX([])).toString('base64'),
        },
      ],
      [
        'POST',
        `/investments/${invB}/contribute`,
        { quantity: '1', priceCents: 100, date: todayIso, accountId: a.acc1 },
      ],
    ];
    for (const [method, path, body] of attempts) {
      expectRefused(`B ${method} ${path} com referência de A`, await call(B, method, path, body));
    }

    // Sugestão de orçamento com categoria de A: ignorada em silêncio, sem gravar.
    const suggestions = await call(B, 'POST', '/budgets/apply-suggestions', {
      month: monthKey,
      categoryIds: [a.cat],
    });
    expectNoLeak('B POST /budgets/apply-suggestions com categoria de A', suggestions);
    expect(suggestions.json.applied).toBe(0);

    // Meta que B consegue criar (na própria conta) só lê o saldo de B.
    const goalB = await ok(B, 'POST', '/goals', {
      name: 'meta B',
      targetCents: 100,
      linkedAccountId: accB,
    });
    expectNoLeak('B POST /goals', { status: 200, text: JSON.stringify(goalB), json: goalB });

    await expectAUntouched('B tentando usar referências de A');
  });

  it('backup forjado por B é recusado inteiro; o legítimo continua restaurando', async () => {
    const exported = await ok(B, 'GET', '/backup/exportar.json');
    const fake = (n: number) => `forjado${RUN}${n}`.padEnd(25, 'x');

    async function restore(content: unknown, mode: 'merge' | 'replace') {
      const started = await ok(B, 'POST', '/backup/restaurar', {
        content: JSON.stringify(content),
        mode,
      });
      const final = await waitFor(async () => {
        const res = await ok(B, 'GET', `/backup/restaurar/${started.job.id}`);
        return res.status === 'DONE' || res.status === 'FAILED' ? res : null;
      }, 'a restauração de B terminar');
      expectNoLeak('B restauração', { status: 200, text: JSON.stringify(final), json: final });
      return final;
    }

    function forge(model: string, row: Record<string, unknown>) {
      const file = structuredClone(exported);
      file.data[model] = [...(file.data[model] ?? []), row];
      return file;
    }

    const forgeries: [string, unknown][] = [
      [
        'meta apontando para a conta de A (leria o saldo dele)',
        forge('goal', {
          id: fake(1),
          name: 'meta forjada',
          targetCents: '100',
          linkedAccountId: a.acc2,
          archived: false,
        }),
      ],
      [
        'divisão pendurada no lançamento de A',
        forge('transactionSplit', {
          id: fake(2),
          transactionId: a.txE,
          categoryId: a.universalCat,
          amountCents: '1',
        }),
      ],
      [
        'cotação no investimento de A',
        forge('priceHistory', { id: fake(3), investmentId: a.investment, date: todayIso, priceCents: '1' }),
      ],
      [
        'lançamento de B na conta de A',
        forge('transaction', {
          id: fake(4),
          type: 'EXPENSE',
          amountCents: '100',
          date: todayIso,
          description: 'forjado',
          status: 'CLEARED',
          accountId: a.acc1,
          isReimbursable: false,
        }),
      ],
      [
        'linha com o id da conta de A (skipDuplicates a pularia em silêncio)',
        forge('account', { id: a.acc1, name: 'minha agora', type: 'CHECKING', balanceCents: '0' }),
      ],
    ];
    for (const [what, file] of forgeries) {
      for (const mode of ['merge', 'replace'] as const) {
        const final = await restore(file, mode);
        expect(final.status, `${what} (${mode}) devia falhar`).toBe('FAILED');
        expect(final.error, what).toMatch(/outro usuário|não são seus/);
      }
    }

    const goals = await call(B, 'GET', '/goals');
    expectNoLeak('B GET /goals depois dos backups forjados', goals);
    await expectAUntouched('restauração de backup forjado por B');

    // O caminho legítimo segue de pé: o próprio export de B volta inteiro.
    const before = await ok(B, 'GET', '/backup/resumo');
    const legit = await restore(exported, 'replace');
    expect(legit.status, JSON.stringify(legit)).toBe('DONE');
    expect(await ok(B, 'GET', '/backup/resumo')).toEqual(before);
    await expectAUntouched('B restaurando o próprio backup');
  });

  it('zona de risco de B não toca em A', async () => {
    const wipe = await call(B, 'POST', '/backup/apagar-lancamentos', { confirm: 'APAGAR LANCAMENTOS' });
    expect(wipe.status, wipe.text).toBeLessThan(300);
    await expectAUntouched('B apagando os próprios lançamentos');

    const del = await call(B, 'DELETE', '/backup/conta', { confirm: 'EXCLUIR MINHA CONTA' });
    expect(del.status, del.text).toBeLessThan(300);
    await expectAUntouched('B excluindo a própria conta');

    // E as categorias universais sobreviveram para todo mundo.
    const cats = await ok(A, 'GET', '/categories');
    for (const id of universalIds) expect(idsIn(cats).has(id)).toBe(true);
  });
});
