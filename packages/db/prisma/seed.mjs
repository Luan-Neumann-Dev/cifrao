// Seed do Cifrão.
// - Sempre: categorias padrão brasileiras (idempotente) + categoria "Ajuste".
// - Com --demo (ou SEED_DEMO=1): contas + ~5.000 lançamentos em 24 meses,
//   com saldos coerentes (armadilha #6). Não recria se já houver contas.
//
// Uso: node prisma/seed.mjs [--demo]

import { PrismaClient } from '@prisma/client';

try {
  process.loadEnvFile();
} catch {
  // usa variáveis já presentes no ambiente
}

const prisma = new PrismaClient();
const DEMO = process.argv.includes('--demo') || process.env.SEED_DEMO === '1';

/** Categorias padrão (pai + filhas). kind: EXPENSE | INCOME | BOTH. */
const CATEGORIES = [
  {
    name: 'Moradia',
    kind: 'EXPENSE',
    icon: 'home',
    color: '#820AD1',
    children: ['Aluguel', 'Condomínio', 'Energia', 'Água', 'Internet', 'Gás'],
  },
  {
    name: 'Alimentação',
    kind: 'EXPENSE',
    icon: 'utensils',
    color: '#E5484D',
    children: ['Supermercado', 'Restaurante', 'Delivery', 'Padaria'],
  },
  {
    name: 'Transporte',
    kind: 'EXPENSE',
    icon: 'car',
    color: '#F5A524',
    children: ['Combustível', 'App de transporte', 'Transporte público', 'Estacionamento'],
  },
  { name: 'Saúde', kind: 'EXPENSE', icon: 'heart-pulse', color: '#00A868', children: ['Farmácia', 'Consultas', 'Plano de saúde'] },
  { name: 'Educação', kind: 'EXPENSE', icon: 'graduation-cap', color: '#0F9B8E', children: ['Cursos', 'Livros'] },
  { name: 'Lazer', kind: 'EXPENSE', icon: 'party-popper', color: '#A855F7', children: ['Cinema', 'Bar', 'Shows'] },
  { name: 'Assinaturas', kind: 'EXPENSE', icon: 'repeat', color: '#6B08AD', children: ['Streaming', 'Software'] },
  { name: 'Compras', kind: 'EXPENSE', icon: 'shopping-bag', color: '#E5484D', children: ['Vestuário', 'Eletrônicos', 'Casa'] },
  { name: 'Serviços', kind: 'EXPENSE', icon: 'wrench', color: '#6B6577', children: ['Telefonia', 'Manutenção'] },
  { name: 'Impostos e Taxas', kind: 'EXPENSE', icon: 'landmark', color: '#1A1523', children: ['IPTU', 'Tarifas bancárias'] },
  { name: 'Pets', kind: 'EXPENSE', icon: 'paw-print', color: '#F5A524', children: [] },
  { name: 'Viagem', kind: 'EXPENSE', icon: 'plane', color: '#0F9B8E', children: [] },
  { name: 'Salário', kind: 'INCOME', icon: 'wallet', color: '#00A868', children: [] },
  { name: 'Freelance', kind: 'INCOME', icon: 'briefcase', color: '#3DD68C', children: [] },
  { name: 'Rendimentos', kind: 'INCOME', icon: 'trending-up', color: '#0F9B8E', children: [] },
  { name: 'Reembolsos', kind: 'INCOME', icon: 'undo', color: '#22C3B0', children: [] },
  { name: 'Ajuste', kind: 'BOTH', icon: 'sliders', color: '#6B6577', children: [] },
];

async function getOrCreateCategory(name, parentId, kind, icon, color) {
  const existing = await prisma.category.findFirst({ where: { name, parentId: parentId ?? null } });
  if (existing) return existing;
  return prisma.category.create({ data: { name, parentId: parentId ?? null, kind, icon, color } });
}

async function seedCategories() {
  const leafExpenseIds = [];
  const parentByKind = { INCOME: [], EXPENSE: [] };
  for (const cat of CATEGORIES) {
    const parent = await getOrCreateCategory(cat.name, null, cat.kind, cat.icon, cat.color);
    if (cat.kind === 'INCOME') parentByKind.INCOME.push(parent.id);
    if (cat.kind === 'EXPENSE' && cat.children.length === 0) leafExpenseIds.push(parent.id);
    for (const childName of cat.children) {
      const child = await getOrCreateCategory(childName, parent.id, cat.kind, cat.icon, cat.color);
      if (cat.kind === 'EXPENSE') leafExpenseIds.push(child.id);
    }
  }
  return { leafExpenseIds, incomeIds: parentByKind.INCOME };
}

// ── Delta de saldo por conta (espelha packages/shared/transaction-logic) ──────
function accountDelta(t, accountId) {
  const amt = BigInt(t.amountCents);
  if (t.type === 'EXPENSE') return t.accountId === accountId ? -amt : 0n;
  if (t.type === 'INCOME') return t.accountId === accountId ? amt : 0n;
  if (t.type === 'ADJUSTMENT') return t.accountId === accountId ? amt : 0n;
  if (t.type === 'TRANSFER') {
    if (t.fromAccountId === accountId) return -amt;
    if (t.toAccountId === accountId) return amt;
  }
  return 0n;
}

const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[rand(0, arr.length - 1)];

async function seedDemo(cats) {
  const accountCount = await prisma.account.count();
  if (accountCount > 0) {
    console.log('• Demo ignorado: já existem contas.');
    return;
  }

  const [corrente, poupanca, carteira, invest] = await Promise.all([
    prisma.account.create({ data: { name: 'Conta Corrente', type: 'CHECKING', color: '#820AD1', institution: 'Banco Roxo', balanceCents: 0n } }),
    prisma.account.create({ data: { name: 'Poupança', type: 'SAVINGS', color: '#00A868', institution: 'Banco Roxo', balanceCents: 0n } }),
    prisma.account.create({ data: { name: 'Carteira', type: 'WALLET', color: '#F5A524', balanceCents: 0n } }),
    prisma.account.create({ data: { name: 'Investimentos', type: 'INVESTMENT', color: '#0F9B8E', institution: 'Corretora', balanceCents: 0n } }),
  ]);

  const rows = [];
  const now = new Date();
  const salaryCat = cats.incomeIds[0];

  for (let m = 23; m >= 0; m--) {
    const base = new Date(now.getFullYear(), now.getMonth() - m, 1);
    const y = base.getFullYear();
    const mo = base.getMonth();

    // Salário no dia 5
    rows.push({
      type: 'INCOME', amountCents: BigInt(rand(700000, 950000)), date: new Date(y, mo, 5, 12),
      description: 'Salário', status: 'CLEARED', accountId: corrente.id, categoryId: salaryCat ?? null,
    });
    // Recorrentes de moradia (dia 10)
    rows.push({ type: 'EXPENSE', amountCents: BigInt(rand(150000, 220000)), date: new Date(y, mo, 10, 12), description: 'Aluguel', status: 'CLEARED', accountId: corrente.id, categoryId: pick(cats.leafExpenseIds) });
    rows.push({ type: 'EXPENSE', amountCents: BigInt(rand(8000, 25000)), date: new Date(y, mo, 12, 12), description: 'Energia', status: 'CLEARED', accountId: corrente.id, categoryId: pick(cats.leafExpenseIds) });
    rows.push({ type: 'EXPENSE', amountCents: BigInt(rand(9900, 14900)), date: new Date(y, mo, 15, 12), description: 'Internet', status: 'CLEARED', accountId: corrente.id, categoryId: pick(cats.leafExpenseIds) });

    // Transferência mensal para poupança e investimento (não é despesa!)
    rows.push({ type: 'TRANSFER', amountCents: BigInt(rand(50000, 150000)), date: new Date(y, mo, 6, 12), description: 'Reserva', status: 'CLEARED', fromAccountId: corrente.id, toAccountId: poupanca.id });
    rows.push({ type: 'TRANSFER', amountCents: BigInt(rand(30000, 120000)), date: new Date(y, mo, 6, 13), description: 'Aporte', status: 'CLEARED', fromAccountId: corrente.id, toAccountId: invest.id });

    // ~190 despesas variáveis no mês
    for (let i = 0; i < 190; i++) {
      const day = rand(1, 28);
      const useWallet = Math.random() < 0.3;
      rows.push({
        type: 'EXPENSE',
        amountCents: BigInt(rand(500, 25000)),
        date: new Date(y, mo, day, rand(8, 22)),
        description: pick(['Mercado', 'Uber', 'iFood', 'Padaria', 'Farmácia', 'Restaurante', 'Combustível', 'Café', 'Streaming', 'Livraria']),
        status: 'CLEARED',
        accountId: useWallet ? carteira.id : corrente.id,
        categoryId: pick(cats.leafExpenseIds),
      });
    }
  }

  console.log(`• Inserindo ${rows.length} lançamentos…`);
  // createMany em lotes
  const chunk = 1000;
  for (let i = 0; i < rows.length; i += chunk) {
    await prisma.transaction.createMany({ data: rows.slice(i, i + chunk) });
  }

  // Recalcula os saldos a partir dos lançamentos realizados.
  const accounts = [corrente, poupanca, carteira, invest];
  const balances = new Map(accounts.map((a) => [a.id, 5000n * 100n])); // saldo inicial fictício
  for (const t of rows) {
    if (t.status === 'FORECAST') continue;
    for (const a of accounts) balances.set(a.id, balances.get(a.id) + accountDelta(t, a.id));
  }
  for (const a of accounts) {
    await prisma.account.update({ where: { id: a.id }, data: { balanceCents: balances.get(a.id) } });
  }
  console.log('• Saldos recalculados.');
}

async function main() {
  console.log('Seed: categorias…');
  const cats = await seedCategories();
  console.log(`• ${await prisma.category.count()} categorias no total.`);
  if (DEMO) {
    console.log('Seed: dados demo…');
    await seedDemo(cats);
  }
  console.log('Seed concluído.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
