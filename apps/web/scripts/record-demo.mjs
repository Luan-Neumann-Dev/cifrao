// Gravador da demonstração.
//
// Monta um cenário de exemplo PELA API DE VERDADE — então fatura, parcela,
// saldo e "disponível de verdade" saem calculados pelas regras do backend, não
// inventados — e grava as respostas que as telas pedem em
// `src/demo/fixtures/`. O build com NEXT_PUBLIC_DEMO=true serve essas respostas
// sem backend nenhum, com o relógio congelado no instante da gravação.
//
// Rodar contra um banco DESCARTÁVEL e VAZIO (o cadastro do 1º usuário é livre):
//   1. crie o banco, aplique as migrações e o seed de categorias;
//   2. suba web (3000) e API (3001) apontando para ele;
//   3. node apps/web/scripts/record-demo.mjs
// `DEMO_WEB_URL` / `DEMO_API_URL` trocam os endereços.

import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = process.env.DEMO_WEB_URL ?? 'http://localhost:3000';
const API = process.env.DEMO_API_URL ?? 'http://localhost:3001';
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/demo/fixtures');

// ─── Cliente ──────────────────────────────────────────────────────────────────

let token = '';

async function call(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 300)}`);
  return {
    text,
    json: text ? safeJson(text) : null,
    type: res.headers.get('content-type') ?? '',
    disposition: res.headers.get('content-disposition'),
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

const get = async (path) => (await call('GET', path)).json;
const post = async (path, body) => (await call('POST', path, body)).json;
const put = async (path, body) => (await call('PUT', path, body)).json;
const patch = async (path, body) => (await call('PATCH', path, body)).json;

async function signUp() {
  const res = await fetch(`${WEB}/api/auth/sign-up/email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: WEB },
    body: JSON.stringify({
      email: 'visitante@cifrao.demo',
      password: randomBytes(18).toString('base64url'),
      name: 'Visitante',
    }),
  });
  if (!res.ok) throw new Error(`cadastro falhou: ${res.status} ${await res.text()}`);
  const cookie = res.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const tokenRes = await fetch(`${WEB}/api/auth/token`, { headers: { cookie } });
  token = (await tokenRes.json()).token;
}

// ─── Datas (tudo em São Paulo, meio-dia, para não escorregar de dia) ──────────

const NOW = new Date();
const spParts = (d) => {
  const [y, m, day] = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(d)
    .split('-')
    .map(Number);
  return { y, m, day };
};
const TODAY = spParts(NOW);

function addMonths(y, m, n) {
  const total = y * 12 + (m - 1) + n;
  return { y: Math.floor(total / 12), m: (total % 12) + 1 };
}
const pad = (n) => String(n).padStart(2, '0');
const monthKey = ({ y, m }) => `${y}-${pad(m)}`;
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
/** Dia `day` do mês `offset` relativo ao atual, às 12h de SP, em ISO. */
function at(offset, day, hour = 12) {
  const { y, m } = addMonths(TODAY.y, TODAY.m, offset);
  const d = Math.min(day, lastDay(y, m));
  return `${y}-${pad(m)}-${pad(d)}T${pad(hour)}:00:00-03:00`;
}
/** Só o que já aconteceu vira lançamento efetivado. */
const isPast = (offset, day) => offset < 0 || (offset === 0 && day <= TODAY.day);

// Sorteio determinístico: regravar dá o mesmo cenário.
let seed = 20261007;
function rnd() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
const between = (min, max) => Math.round(min + rnd() * (max - min));
const pickOne = (arr) => arr[Math.floor(rnd() * arr.length)];

// ─── Cenário ──────────────────────────────────────────────────────────────────

const HISTORY = 6; // meses para trás, além do atual

async function buildScenario() {
  const categories = await get('/categories');
  const flat = [];
  const walk = (list) => {
    for (const c of list) {
      flat.push(c);
      if (c.children) walk(c.children);
    }
  };
  walk(Array.isArray(categories) ? categories : (categories.items ?? []));
  const cat = (name) => {
    const found = flat.find((c) => c.name === name);
    if (!found) throw new Error(`categoria padrão não encontrada: ${name}`);
    return found.id;
  };

  const corrente = (
    await post('/accounts', {
      name: 'Conta Corrente',
      type: 'CHECKING',
      initialBalanceCents: 420000,
      color: '#820AD1',
      institution: 'Banco Roxo',
    })
  ).id;
  const poupanca = (
    await post('/accounts', {
      name: 'Reserva',
      type: 'SAVINGS',
      initialBalanceCents: 1350000,
      color: '#00A868',
      institution: 'Banco Roxo',
    })
  ).id;
  const carteira = (
    await post('/accounts', {
      name: 'Carteira',
      type: 'WALLET',
      initialBalanceCents: 18000,
      color: '#F5A524',
    })
  ).id;
  const corretora = (
    await post('/accounts', {
      name: 'Corretora',
      type: 'INVESTMENT',
      initialBalanceCents: 50000,
      color: '#0F9B8E',
      institution: 'Corretora Azul',
    })
  ).id;

  const roxo = (
    await post('/credit-cards', {
      nickname: 'Roxinho',
      brand: 'Mastercard',
      last4: '4821',
      limitCents: 900000,
      closingDay: 28,
      dueDay: 5,
      color: '#820AD1',
      defaultPaymentAccountId: corrente,
    })
  ).id;
  const azul = (
    await post('/credit-cards', {
      nickname: 'Cartão Azul',
      brand: 'Visa',
      last4: '1937',
      limitCents: 400000,
      closingDay: 10,
      dueDay: 17,
      color: '#0EA5E9',
      defaultPaymentAccountId: corrente,
    })
  ).id;

  const viagem = (await post('/tags', { name: 'viagem', color: '#0F9B8E' })).id;
  const trabalho = (await post('/tags', { name: 'trabalho', color: '#6B6577' })).id;

  const expense = (accountId, offset, day, amountCents, description, category, extra = {}) =>
    post('/transactions', {
      type: 'EXPENSE',
      accountId,
      amountCents,
      date: at(offset, day, between(8, 21)),
      description,
      categoryId: cat(category),
      status: isPast(offset, day) ? 'CLEARED' : 'FORECAST',
      ...extra,
    });
  const income = (offset, day, amountCents, description, category) =>
    post('/transactions', {
      type: 'INCOME',
      accountId: corrente,
      amountCents,
      date: at(offset, day),
      description,
      categoryId: cat(category),
      status: 'CLEARED',
    });
  const purchase = (
    card,
    offset,
    day,
    amountCents,
    description,
    category,
    installments = 1,
    extra = {},
  ) =>
    post(`/credit-cards/${card}/purchases`, {
      amountCents,
      date: at(offset, day, between(9, 22)),
      description,
      categoryId: cat(category),
      installments,
      ...extra,
    });

  // Gastos do dia a dia: descrição de extrato → categoria certa.
  const DIA_A_DIA = [
    ['Supermercado Pão Dourado', 'Supermercado', 9000, 38000],
    ['Hortifruti da Vila', 'Supermercado', 3000, 9000],
    ['Padaria Trigo Bom', 'Padaria', 900, 3500],
    ['iFood', 'Delivery', 3500, 9500],
    ['Uber', 'App de transporte', 1400, 4800],
    ['99', 'App de transporte', 1200, 3900],
    ['Posto Avenida', 'Combustível', 15000, 26000],
    ['Drogaria Saúde', 'Farmácia', 2500, 12000],
    ['Restaurante Sabor Caseiro', 'Restaurante', 4500, 14000],
    ['Café Central', 'Restaurante', 1200, 3200],
    ['Cinema Paradiso', 'Cinema', 4000, 9000],
    ['Bar do Zé', 'Bar', 6000, 18000],
  ];

  for (let offset = -HISTORY; offset <= 0; offset++) {
    // Renda e contas fixas.
    if (isPast(offset, 5)) await income(offset, 5, 850000, 'Salário', 'Salário');
    if (offset % 2 === 0 && isPast(offset, 20)) {
      await income(
        offset,
        20,
        between(120000, 250000),
        'Freelance — site institucional',
        'Freelance',
      );
    }
    if (isPast(offset, 10))
      await expense(corrente, offset, 10, 210000, 'Aluguel', 'Aluguel', { paymentMethod: 'PIX' });
    if (isPast(offset, 20))
      await expense(corrente, offset, 20, 48000, 'Condomínio', 'Condomínio', {
        paymentMethod: 'BOLETO',
      });
    if (isPast(offset, 14))
      await expense(corrente, offset, 14, between(14000, 23000), 'Energia elétrica', 'Energia', {
        paymentMethod: 'BOLETO',
      });
    if (isPast(offset, 15))
      await expense(corrente, offset, 15, 11990, 'Internet fibra', 'Internet', {
        paymentMethod: 'DEBIT',
      });
    if (isPast(offset, 25))
      await expense(corrente, offset, 25, 42000, 'Plano de saúde', 'Plano de saúde', {
        paymentMethod: 'BOLETO',
      });

    // Assinaturas no cartão.
    if (isPast(offset, 3))
      await purchase(roxo, offset, 3, 5590, 'Streaming de filmes', 'Streaming');
    if (isPast(offset, 7))
      await purchase(roxo, offset, 7, 2190, 'Streaming de música', 'Streaming');
    if (isPast(offset, 12)) await purchase(azul, offset, 12, 4900, 'Academia', 'Lazer');

    // Reserva e aporte do mês: transferência, não despesa (regra 5.7).
    if (isPast(offset, 6)) {
      await post('/transactions', {
        type: 'TRANSFER',
        fromAccountId: corrente,
        toAccountId: poupanca,
        amountCents: 80000,
        date: at(offset, 6),
        description: 'Reserva do mês',
      });
      await post('/transactions', {
        type: 'TRANSFER',
        fromAccountId: corrente,
        toAccountId: corretora,
        amountCents: 100000,
        date: at(offset, 6, 13),
        description: 'Transferência para a corretora',
      });
      await post('/transactions', {
        type: 'TRANSFER',
        fromAccountId: corrente,
        toAccountId: carteira,
        amountCents: 30000,
        date: at(offset, 6, 17),
        description: 'Saque',
      });
    }

    // Dia a dia: ~38 lançamentos por mês, proporcional no mês corrente — senão
    // o orçamento estoura no dia 7 de um jeito que nenhum mês real estoura.
    const lastOfMonth = offset === 0 ? TODAY.day : 28;
    const count = offset === 0 ? Math.round((38 * TODAY.day) / 30) : 38;
    for (let i = 0; i < count; i++) {
      const [description, category, min, max] = pickOne(DIA_A_DIA);
      const day = between(1, lastOfMonth);
      const amount = between(min, max);
      const roll = rnd();
      if (roll < 0.3) {
        await purchase(rnd() < 0.7 ? roxo : azul, offset, day, amount, description, category);
      } else if (roll < 0.42) {
        await expense(carteira, offset, day, Math.min(amount, 4000), description, category, {
          paymentMethod: 'CASH',
        });
      } else {
        await expense(corrente, offset, day, amount, description, category, {
          paymentMethod: rnd() < 0.6 ? 'PIX' : 'DEBIT',
        });
      }
    }
  }

  // Compras parceladas (regra 5.4): cada parcela numa fatura diferente.
  await purchase(roxo, -4, 18, 459900, 'Notebook', 'Eletrônicos', 10);
  await purchase(roxo, -2, 22, 389900, 'Geladeira frost free', 'Casa', 6);
  await purchase(azul, -1, 9, 186000, 'Passagem aérea — Recife', 'Viagem', 3, { tagIds: [viagem] });
  await purchase(roxo, 0, Math.max(1, TODAY.day - 2), 74990, 'Tênis de corrida', 'Vestuário', 2);

  // O delivery do mês passou do limite: é o aviso que o painel mostra.
  for (let i = 0; i < 4; i++) {
    await expense(
      corrente,
      0,
      Math.max(1, TODAY.day - i),
      between(6500, 9800),
      'iFood',
      'Delivery',
      { paymentMethod: 'PIX' },
    );
  }

  // Reembolsáveis (regra 5.13): um pendente e um já devolvido em parte.
  const almoco = await expense(
    corrente,
    0,
    Math.max(1, TODAY.day - 3),
    18700,
    'Almoço com cliente',
    'Restaurante',
    {
      isReimbursable: true,
      tagIds: [trabalho],
      paymentMethod: 'DEBIT',
    },
  );
  void almoco;
  const uberTrabalho = await expense(
    corrente,
    -1,
    16,
    8640,
    'Uber — visita a cliente',
    'App de transporte',
    {
      isReimbursable: true,
      tagIds: [trabalho],
      paymentMethod: 'PIX',
    },
  );
  await post(`/transactions/${uberTrabalho.id}/reimburse`, {
    accountId: corrente,
    amountCents: 5000,
    date: at(-1, 25),
  });

  // Divisão entre categorias: a compra grande do mercado levou coisa de casa.
  const mercadao = await expense(corrente, -1, 2, 64000, 'Atacadão do Bairro', 'Supermercado', {
    paymentMethod: 'DEBIT',
  });
  await put(`/transactions/${mercadao.id}/splits`, {
    splits: [
      { categoryId: cat('Supermercado'), amountCents: 47000 },
      { categoryId: cat('Casa'), amountCents: 17000 },
    ],
  });

  // Ajuste de saldo (regra 5.8): a carteira tinha menos do que o app dizia.
  const carteiraAtual = await get(`/accounts/${carteira}`);
  await post(`/accounts/${carteira}/adjust`, {
    realBalanceCents: Math.max(0, Number(carteiraAtual.balanceCents) - 2350),
    description: 'Conferência da carteira',
  });

  // Faturas: tudo o que já venceu foi pago no vencimento (regra 5.6 — pagar é
  // transferência, não despesa).
  for (const card of [roxo, azul]) {
    const detail = await get(`/credit-cards/${card}`);
    const invoices = (detail.invoices ?? [])
      .filter((inv) => new Date(inv.dueDate) < NOW)
      .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    for (const inv of invoices) {
      const remaining = Number(inv.totalCents) - Number(inv.paidCents);
      if (remaining <= 0) continue;
      await post(`/invoices/${inv.id}/pay`, {
        accountId: corrente,
        amountCents: remaining,
        date: inv.dueDate,
      });
    }
  }

  // Investimentos (Fase 8): aportes mensais saindo da corretora.
  const carteiraInv = [
    { ticker: 'BOVA11', name: 'ETF Ibovespa', class: 'STOCKS', price: 12000, drift: 0.012 },
    { ticker: 'HGLG11', name: 'FII de logística', class: 'REITS', price: 16000, drift: 0.004 },
    {
      ticker: 'TESOURO SELIC',
      name: 'Tesouro Selic 2029',
      class: 'TREASURY',
      price: 1450000,
      drift: 0.009,
    },
  ];
  for (const pos of carteiraInv) {
    const created = await post('/investments', {
      ticker: pos.ticker,
      name: pos.name,
      class: pos.class,
      currentPriceCents: pos.price,
    });
    pos.id = created.id;
  }
  for (let offset = -HISTORY; offset <= 0; offset++) {
    if (!isPast(offset, 7)) continue;
    for (const pos of carteiraInv) {
      pos.price = Math.round(pos.price * (1 + pos.drift + (rnd() - 0.5) * 0.04));
      const budget = pos.class === 'TREASURY' ? 30000 : 35000;
      const quantity =
        pos.class === 'TREASURY'
          ? (budget / pos.price).toFixed(4)
          : String(Math.max(1, Math.floor(budget / pos.price)));
      await post(`/investments/${pos.id}/contribute`, {
        quantity,
        priceCents: pos.price,
        date: at(offset, 7, 14),
        accountId: corretora,
      });
      await patch(`/investments/${pos.id}/price`, {
        priceCents: pos.price,
        date: at(offset, 28, 18),
      });
    }
  }
  for (const pos of carteiraInv) {
    await patch(`/investments/${pos.id}/price`, { priceCents: Math.round(pos.price * 1.015) });
  }
  await put('/investments/targets', {
    targets: [
      { class: 'STOCKS', targetPercent: 40 },
      { class: 'REITS', targetPercent: 25 },
      { class: 'TREASURY', targetPercent: 35 },
    ],
  });

  // Orçamento (regra 5.10): mês atual e anteriores; delivery estourando.
  for (let offset = -HISTORY; offset <= 0; offset++) {
    const month = monthKey(addMonths(TODAY.y, TODAY.m, offset));
    for (const [name, limit] of [
      ['Supermercado', 180000],
      ['Restaurante', 70000],
      ['Delivery', 30000],
      ['App de transporte', 35000],
      ['Combustível', 70000],
      ['Bar', 50000],
    ]) {
      await put('/budgets', { categoryId: cat(name), month, limitCents: limit });
    }
  }

  // Metas (regra 5.9): apontam para saldo que já existe.
  await post('/goals', {
    name: 'Reserva de emergência',
    targetCents: 3000000,
    linkedAccountId: poupanca,
    monthlyContributionCents: 80000,
  });
  await post('/goals', {
    name: 'Viagem de fim de ano',
    targetCents: 800000,
    deadline: at(2, 20),
    linkedAccountId: corretora,
  });

  // Recorrências (regra 5.11): geram os previstos daqui para frente.
  const next = (day) => (TODAY.day < day ? at(0, day) : at(1, day));
  for (const rule of [
    {
      type: 'INCOME',
      accountId: corrente,
      categoryId: cat('Salário'),
      description: 'Salário',
      amountCents: 850000,
      day: 5,
    },
    {
      type: 'EXPENSE',
      accountId: corrente,
      categoryId: cat('Aluguel'),
      description: 'Aluguel',
      amountCents: 210000,
      day: 10,
    },
    {
      type: 'EXPENSE',
      accountId: corrente,
      categoryId: cat('Condomínio'),
      description: 'Condomínio',
      amountCents: 48000,
      day: 20,
    },
    {
      type: 'EXPENSE',
      accountId: corrente,
      categoryId: cat('Plano de saúde'),
      description: 'Plano de saúde',
      amountCents: 42000,
      day: 25,
    },
    {
      type: 'EXPENSE',
      accountId: corrente,
      categoryId: cat('Internet'),
      description: 'Internet fibra',
      amountCents: 11990,
      day: 15,
    },
  ]) {
    const { day, ...body } = rule;
    await post('/recurring-rules', {
      ...body,
      frequency: 'MONTHLY',
      startDate: next(day),
      dayOfMonth: day,
    });
  }

  // Regras de categoria aprendidas (regra 5.12).
  await post('/category-rules', { pattern: 'uber', categoryId: cat('App de transporte') });
  await post('/category-rules', { pattern: 'ifood', categoryId: cat('Delivery') });
  await post('/category-rules', { pattern: 'posto', categoryId: cat('Combustível') });

  // Uma importação esperando revisão: mostra duplicata, regra e sugestão.
  const ofxLines = [
    ['UBER *TRIP', -2390],
    ['IFOOD *RESTAURANTE', -6490],
    ['POSTO AVENIDA', -21000],
    ['PIX RECEBIDO — JOAO', 15000],
    ['MERCADO DA ESQUINA', -8730],
    ['PADARIA TRIGO BOM', -1850],
  ].map(([memo, cents], i) => {
    const day = Math.max(1, TODAY.day - i);
    const value = (cents / 100).toFixed(2);
    return `<STMTTRN><TRNTYPE>${cents < 0 ? 'DEBIT' : 'CREDIT'}<DTPOSTED>${TODAY.y}${pad(TODAY.m)}${pad(day)}120000[-3:BRT]<TRNAMT>${value}<FITID>DEMO-${i}<MEMO>${memo}</STMTTRN>`;
  });
  const ofx = `OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS>\n<BANKACCTFROM><BANKID>001<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>\n<BANKTRANLIST>\n${ofxLines.join('\n')}\n</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const upload = await post('/imports', {
    filename: 'extrato-banco-roxo.ofx',
    accountId: corrente,
    contentBase64: Buffer.from(ofx).toString('base64'),
  });
  for (let i = 0; i < 60; i++) {
    const batch = await get(`/imports/${upload.id}`);
    if ((batch.status ?? batch.batch?.status) === 'REVIEW') break;
    await new Promise((r) => setTimeout(r, 500));
  }

  await patch('/settings/profile', { name: 'Visitante' });
  await post('/settings/onboarding/concluir');

  return {
    cards: [roxo, azul],
    accounts: [corrente, poupanca, carteira, corretora],
    importId: upload.id,
  };
}

// ─── Gravação ─────────────────────────────────────────────────────────────────

/** Mesma conta que `presetRange` em relatorios/page.tsx. */
function reportRanges() {
  const range = (off) => {
    const { y, m } = addMonths(TODAY.y, TODAY.m, off);
    return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDay(y, m))}` };
  };
  const ranges = [
    range(0),
    range(-1),
    { from: range(-2).from, to: range(0).to },
    { from: `${TODAY.y}-01-01`, to: `${TODAY.y}-12-31` },
  ];
  for (let off = -HISTORY - 1; off <= 1; off++) ranges.push(range(off));
  return ranges;
}

/** Sessão gravada não leva IP nem navegador da máquina que gravou. */
function sanitize(path, json) {
  if (path !== '/settings/sessions' || !Array.isArray(json)) return json;
  return json.map((s) => ({ ...s, ipAddress: null, userAgent: 'Navegador da demonstração' }));
}

async function record({ cards, accounts }) {
  const responses = {};
  const downloads = {};
  const rec = async (path) => {
    const res = await call('GET', path);
    responses[path] = sanitize(path, res.json);
    return responses[path];
  };
  const download = async (path) => {
    const res = await call('GET', path);
    downloads[path] = { type: res.type, disposition: res.disposition, body: res.text };
  };

  for (const path of [
    '/accounts',
    '/categories',
    '/categories/uso',
    '/tags',
    '/credit-cards',
    '/settings',
    '/settings/onboarding',
    '/settings/sessions',
    '/notifications',
    '/receivables',
    '/goals',
    '/recurring-rules',
    '/recurring-rules/forecasts',
    '/category-rules',
    '/imports',
    '/investments',
    '/backup/resumo',
    '/dashboard',
    '/reports/revisao',
  ]) {
    await rec(path);
  }

  // Telas com navegação por mês: a janela inteira do cenário e um pouco além.
  for (let off = -HISTORY - 1; off <= 6; off++) {
    const month = monthKey(addMonths(TODAY.y, TODAY.m, off));
    await rec(`/dashboard?month=${month}`);
    await rec(`/budgets?month=${month}`);
    await rec(`/budgets/suggestions?month=${month}`);
    await rec(`/calendar?month=${month}`);
    if (off <= 0) await rec(`/reports/revisao?month=${month}`);
  }

  for (const { from, to } of reportRanges()) {
    await rec(`/reports?${new URLSearchParams({ from, to })}`);
    for (const accountId of accounts) {
      await rec(`/reports?${new URLSearchParams({ from, to, accountId })}`);
    }
  }
  for (const { from, to } of reportRanges().slice(0, 4)) {
    for (const section of ['categorias', 'lancamentos', 'serie', 'estabelecimentos']) {
      await download(`/reports/export?${new URLSearchParams({ from, to, section })}`);
    }
  }
  await download('/backup/exportar.json');
  for (const section of [
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
  ]) {
    await download(`/backup/exportar.csv?section=${section}`);
  }

  for (const id of accounts) {
    await rec(`/accounts/${id}`);
    await rec(`/accounts/${id}/balance-evolution`);
  }
  for (const id of cards) {
    const detail = await rec(`/credit-cards/${id}`);
    await rec(`/credit-cards/${id}/commitment`);
    for (const inv of detail.invoices ?? []) await rec(`/invoices/${inv.id}`);
  }
  for (const batch of responses['/imports'] ?? []) {
    await rec(`/imports/${batch.id}?pageSize=500`);
  }

  // Lançamentos: a lista inteira, que a demo filtra em memória com as mesmas
  // regras do backend (qualquer combinação de filtro funciona).
  const transactions = [];
  for (let page = 1; ; page++) {
    const res = await get(`/transactions?pageSize=200&page=${page}`);
    transactions.push(...res.items);
    if (transactions.length >= res.total) break;
  }
  const purchaseIds = new Set(transactions.map((t) => t.purchaseId).filter(Boolean));
  for (const id of purchaseIds) await rec(`/purchases/${id}`);
  for (const t of transactions) {
    const splits = await get(`/transactions/${t.id}/splits`);
    if (splits.splits.length > 0) responses[`/transactions/${t.id}/splits`] = splits;
  }

  return { responses, downloads, transactions };
}

async function main() {
  await signUp();
  console.log('Montando o cenário pela API…');
  const ctx = await buildScenario();
  console.log('Gravando as respostas…');
  const { responses, downloads, transactions } = await record(ctx);

  mkdirSync(OUT, { recursive: true });
  const write = (name, data) => writeFileSync(join(OUT, name), `${JSON.stringify(data)}\n`);
  write('meta.json', { frozenAt: NOW.toISOString() });
  write('responses.json', responses);
  write('transactions.json', transactions);
  write('downloads.json', downloads);
  console.log(
    `Pronto: ${Object.keys(responses).length} respostas, ${transactions.length} lançamentos, ` +
      `${Object.keys(downloads).length} downloads, congelado em ${NOW.toISOString()}.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
