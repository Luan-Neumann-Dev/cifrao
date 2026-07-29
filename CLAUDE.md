# Cifrão — Prompt de implementação para o Claude Code

> Cole este arquivo inteiro na primeira mensagem do Claude Code (ou salve como `CLAUDE.md` na raiz do repositório vazio e mande "leia o CLAUDE.md e comece pela Fase 0").

---

## 1. Contexto

Você vai construir o **Cifrão**, um app web de finanças pessoais **de uso individual** (um único usuário: eu). Não é SaaS, não tem multi-tenant, não tem plano pago, não tem onboarding de clientes. O app roda na internet só pra eu poder usar de qualquer lugar sem subir ambiente local.

O design já existe e está definido na Seção 4. As regras de negócio da Seção 5 são o coração do produto — **elas não são sugestões, são requisitos**. Se você implementar fatura de cartão errado, o app inteiro perde sentido.

---

## 2. Stack — fixa, não substituir

| Camada | Tecnologia | Observação |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | |
| Frontend | Next.js 15 (App Router, TypeScript) | Server Components onde der; Client Components só onde há interação |
| Backend | NestJS 11 (TypeScript) | REST, não GraphQL |
| ORM | Prisma | |
| Banco | PostgreSQL | Neon ou Supabase — string de conexão vem do `.env` |
| Validação | Zod (schemas compartilhados) | fonte única de verdade dos tipos |
| Auth | Better Auth no Next, JWT em cookie httpOnly lido pelo Nest | com 2FA TOTP |
| Estilo | Tailwind CSS v4 + shadcn/ui | tokens no `@theme`, ver Seção 4 |
| Gráficos | Recharts | |
| Fila / jobs | pg-boss (roda no próprio Postgres) | **não** adicionar Redis |
| Cron | `@nestjs/schedule` | |
| Arquivos | Cloudflare R2 (S3-compatible) | anexos de comprovante |
| Testes | Vitest + Supertest | |

**Não instale nenhuma outra dependência sem me perguntar antes.** Se achar que precisa de uma lib, pare e justifique em uma frase.

---

## 3. Estrutura do monorepo

```
cifrao/
├── apps/
│   ├── web/          # Next 15
│   └── api/          # NestJS
├── packages/
│   ├── db/           # schema.prisma + client gerado + seeds
│   └── shared/       # schemas Zod, tipos, enums, helpers de dinheiro e data
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

Regra dura: **nenhum tipo de domínio é declarado duas vezes.** Toda entidade tem seu schema Zod em `packages/shared`; o Nest valida entrada com ele via pipe, o Next infere o tipo de resposta a partir dele. Se você se pegar escrevendo `interface Transaction` no front, está errado.

---

## 4. Design system

Tokens já definidos, aplicar no `@theme` do Tailwind v4 e alternar tema por `[data-theme="dark"]` no `<html>`:

```css
:root{
  --primary:#820AD1; --primary-hover:#6B08AD; --primary-soft:#F3E8FF;
  --bg:#FAFAFC; --surface:#FFFFFF; --surface-2:#F3F1F7; --line:#E8E4EF;
  --ink:#1A1523; --ink-2:#6B6577;
  --positive:#00A868; --negative:#E5484D; --warn:#F5A524; --invest:#0F9B8E;
  --card-shadow:0 1px 3px rgba(26,21,35,.06); --card-border:transparent;
  --ring:0 0 0 4px rgba(130,10,209,.22); --fab-shadow:0 12px 30px rgba(130,10,209,.34);
  --track:#E8E4EF; --overlay:rgba(26,21,35,.04);
}
[data-theme="dark"]{
  --primary:#A855F7; --primary-hover:#9333EA; --primary-soft:#2A1140;
  --bg:#0E0B12; --surface:#171320; --surface-2:#211B2E; --line:#2E2740;
  --ink:#F5F3F8; --ink-2:#A79FB8;
  --positive:#3DD68C; --negative:#FF6369; --warn:#F7B955; --invest:#22C3B0;
  --card-shadow:none; --card-border:#2E2740;
  --ring:0 0 0 4px rgba(168,85,247,.32); --fab-shadow:0 12px 32px rgba(168,85,247,.28);
  --track:#2E2740; --overlay:rgba(255,255,255,.05);
}
```

- Fontes: **Inter** (texto, 400/500/600) e **Manrope** (números e títulos, 500–800). Valores monetários grandes usam Manrope com `font-variant-numeric: tabular-nums`.
- Raios: `20px` cards, `11–14px` inputs e botões, `999px` chips e pills.
- Mobile-first. Todas as telas precisam funcionar em 380px. Ações primárias no mobile ficam em FAB ou bottom sheet, não em botão de topo.
- O app deve ser instalável como **PWA** (manifest + ícones + service worker básico). Isso substitui app nativo.

---

## 5. Regras de domínio — leia com atenção

Essas regras são a razão de o app existir. Implemente exatamente assim.

### 5.1 Dinheiro
Todo valor monetário é **inteiro em centavos** (`BigInt` no Prisma, `bigint`/`number` seguro no TS). Nunca float, nunca `Decimal`. Crie helpers em `packages/shared`: `toCents(str)`, `formatBRL(cents)`, `sumCents(...)`. Formatação BRL só na camada de apresentação.

### 5.2 Datas e fuso
Persistir tudo em **UTC**. Converter para `America/Sao_Paulo` só na exibição e no cálculo de "que mês é esse lançamento". Use `date-fns-tz`. Fatura que fecha dia 28 vira dia 27 se você errar isso.

### 5.3 Fatura de cartão é entidade própria
`Invoice` existe como tabela, com `closingDate`, `dueDate`, `status` (OPEN, CLOSED, PAID, PARTIAL). Cada `Transaction` de cartão aponta para uma `invoiceId`. Ao lançar uma compra no cartão, o sistema calcula em qual fatura ela cai comparando a data com o dia de fechamento do cartão. A UI mostra "entra na fatura de agosto (fecha 28/07)" no momento do lançamento.

### 5.4 Parcelamento
Uma compra parcelada gera **uma `Purchase` pai e N `Transaction` filhas**, cada uma em uma fatura diferente, com `installmentNumber` e `installmentTotal`. Editar a compra pai propaga para as parcelas futuras, nunca para as já pagas.

### 5.5 "Disponível de verdade" no cartão
```
disponível_real = limite − fatura_atual_em_aberto − parcelas_futuras_já_comprometidas
```
Parcela futura consome limite mesmo sem ter virado fatura. Exibir os três números separados no detalhe do cartão, com a explicação.

### 5.6 Pagamento de fatura é transferência, não despesa
Pagar fatura move dinheiro da conta para o cartão. **Não** cria despesa nova — os gastos já foram contados quando lançados. Suportar pagamento total e parcial (parcial deixa a fatura em `PARTIAL` e rola o resto).

### 5.7 Transferência entre contas
`type = TRANSFER`, com `fromAccountId` e `toAccountId`. Não entra em receita nem em despesa em nenhum relatório, gráfico ou orçamento. Isso precisa estar garantido por teste.

### 5.8 Ajuste de saldo
O usuário informa o saldo real do banco; o sistema cria um lançamento de ajuste da diferença (categoria própria "Ajuste"), sem apagar histórico.

### 5.9 Metas apontam para saldo existente
Uma `Goal` é vinculada a uma conta ou investimento que **já existe**. Ela não move dinheiro nem cria saldo paralelo. O progresso é lido do saldo vinculado. Nenhum real pode ser contado duas vezes.

### 5.10 Orçamento
Limite mensal por categoria. Calcular gasto do mês, restante, e média diária permitida no que resta do mês. Função "sugerir limites" usa a média dos últimos 3 meses.

### 5.11 Recorrências
`RecurringRule` gera lançamentos previstos (`status = FORECAST`) até a data final ou indefinidamente. Previsto vira efetivado quando o usuário confirma ou quando a importação faz match. O dashboard usa os previstos para calcular "disponível de verdade até o fim do mês".

### 5.12 Importação e regras
Arquivos OFX, CSV e QIF. **Não escreva parser próprio** — use `ofx-js` ou `node-ofx-parser` e `papaparse` para CSV. O fluxo é: upload → detecção de formato e conta → mapeamento de colunas (só CSV) → revisão transação a transação → confirmação. **Nada é gravado até a confirmação final.**
- Detecção de duplicata: mesma conta + data ±3 dias + mesmo valor + descrição similar.
- `CategoryRule`: padrão de descrição (+ faixa de valor opcional) → categoria. Ao categorizar na revisão, oferecer "aplicar a todos os N lançamentos com esse padrão e criar regra".
- Todo o processamento roda em **job do pg-boss**, nunca no request HTTP.

### 5.13 Reembolsáveis
Lançamento marcado como reembolsável entra em "A receber" com status pendente até ser marcado como recebido.

---

## 6. Modelo de dados inicial

Crie o `schema.prisma` com pelo menos estas entidades e relações. Você pode ajustar nomes de campos, mas não a estrutura de relacionamento:

- `User` — um só; `email`, `passwordHash`, `totpSecret`, `recoveryCodes[]`, `theme`, `accentColor`
- `Session`
- `Account` — conta bancária: `name`, `type` (CHECKING, SAVINGS, WALLET, INVESTMENT), `balanceCents`, `color`, `institution`
- `CreditCard` — `nickname`, `brand`, `last4`, `limitCents`, `closingDay`, `dueDay`, `defaultPaymentAccountId`, `color`
- `Invoice` — `creditCardId`, `referenceMonth`, `closingDate`, `dueDate`, `status`, `paidCents`
- `Category` — hierárquica (`parentId`), `icon`, `color`, `kind` (EXPENSE, INCOME, BOTH)
- `Tag` + `TransactionTag` (N:N)
- `Purchase` — compra pai de parcelamento
- `Transaction` — `type` (EXPENSE, INCOME, TRANSFER, ADJUSTMENT), `amountCents`, `date`, `description`, `originalDescription`, `status` (PENDING, CLEARED, FORECAST), `accountId?`, `creditCardId?`, `invoiceId?`, `fromAccountId?`, `toAccountId?`, `categoryId?`, `purchaseId?`, `installmentNumber?`, `installmentTotal?`, `isReimbursable`, `reimbursedAt?`, `notes`
- `TransactionSplit` — divisão de um lançamento entre categorias
- `Attachment` — comprovante em R2, ligado a `Transaction`
- `RecurringRule` — `frequency`, `dayOfMonth`, `endDate?`, template do lançamento
- `Budget` — `categoryId`, `month`, `limitCents`
- `Goal` — `name`, `targetCents`, `deadline?`, `linkedAccountId`, `monthlyContributionCents?`
- `CategoryRule` — `pattern`, `minCents?`, `maxCents?`, `categoryId`, `appliedCount`
- `ImportBatch` + `ImportRow` — staging da importação até a confirmação
- `Investment` — `ticker`, `class`, `quantity`, `avgPriceCents`, `currentPriceCents`, `source` (MANUAL, SYNCED), `updatedAt`
- `InvestmentTransaction` — aporte/resgate
- `PriceHistory` — cotação diária por ativo

Índices obrigatórios: `Transaction(date)`, `Transaction(accountId, date)`, `Transaction(invoiceId)`, `Transaction(categoryId, date)`.

---

## 7. Passo a passo — uma fase por vez

**Regra de trabalho: implemente UMA fase, rode os testes, faça commit, e PARE. Me mostre o que fez e espere eu mandar seguir.** Não emende fases.

### Fase 0 — Fundação
- Monorepo pnpm + Turborepo, `apps/web`, `apps/api`, `packages/db`, `packages/shared`
- `docker-compose.yml` com Postgres para desenvolvimento
- Prisma inicializado, conexão via `DATABASE_URL` + `DIRECT_URL` (migrations)
- ESLint + Prettier + TypeScript strict em todos os pacotes
- Helpers de dinheiro e data em `packages/shared`, **com testes**
- Health check no Nest, página em branco no Next consumindo ele

✅ Aceite: `pnpm dev` sobe web + api + banco; `pnpm test` passa.

### Fase 1 — Auth
- Better Auth com email/senha + TOTP 2FA + códigos de recuperação
- **Registro liberado só para o primeiro usuário; depois disso, fechado por variável de ambiente**
- Cookie httpOnly, SameSite=Lax; guard no Nest validando o JWT
- Telas: login, criar conta, verificar 2FA, configurar 2FA (QR + códigos), recuperar senha, redefinir senha

✅ Aceite: consigo criar minha conta, ativar 2FA e logar; uma segunda tentativa de registro é bloqueada.

### Fase 2 — Contas + Categorias + Lançamentos (o núcleo)
- CRUD de contas com evolução de saldo (6 meses)
- Seed de categorias padrão brasileiras com ícone e cor
- CRUD de lançamentos: despesa, receita, transferência
- Filtros: período, tipo, conta/cartão, categoria, tag, status, busca
- Seleção múltipla com ações em lote (categorizar, marcar pago, tag, excluir)
- Transferência entre contas e ajuste de saldo (regras 5.7 e 5.8)
- Toast com "desfazer" em toda ação destrutiva

✅ Aceite: lanço, edito, filtro e transfiro; transferência não aparece como gasto em lugar nenhum (teste automatizado provando isso).

### Fase 3 — Cartões e faturas
- CRUD de cartão com fechamento/vencimento
- Geração automática de faturas e roteamento de lançamento para a fatura certa (5.3)
- Parcelamento (5.4)
- "Disponível de verdade" (5.5)
- Pagamento de fatura total e parcial (5.6)
- Gráfico de comprometimento em parcelas nos próximos 12 meses

✅ Aceite: compra parcelada em 6x cai em 6 faturas distintas; pagar fatura não cria despesa; testes cobrindo virada de fatura na data de fechamento.

### Fase 4 — Dashboard
- Saldo disponível hoje e "disponível de verdade" até o fim do mês (desconta previstos e comprometidos)
- Timeline "o que vem por aí" (próximos vencimentos e recebimentos)
- Faturas abertas, gastos por categoria (com filtro por clique), orçamento resumido, últimos lançamentos, patrimônio
- Card de insight do mês (comparação com a média das categorias)

✅ Aceite: dashboard carrega em menos de 1s com 5.000 lançamentos no seed.

### Fase 5 — Recorrências, orçamento e metas
- `RecurringRule` + geração de previstos + cron diário (5.11)
- Orçamento por categoria + sugestão de limites (5.10)
- Metas vinculadas a saldo existente + ETA no ritmo atual (5.9)
- Calendário de contas com saldo projetado dia a dia
- Painel "A receber" (reembolsáveis, 5.13)

✅ Aceite: uma recorrência mensal gera previstos corretos por 12 meses; meta nunca cria saldo novo.

### Fase 6 — Importação
- Upload para R2, detecção de formato e de conta
- Parser OFX/QIF/CSV com mapeamento de colunas e prévia de 5 linhas
- Staging em `ImportBatch`/`ImportRow` — nada gravado antes de confirmar
- Detecção de duplicata e tela de revisão com sugestão de categoria
- Motor de `CategoryRule`, criação de regra a partir da revisão, tela de gerenciamento de regras
- Tudo em job pg-boss com progresso visível na UI

✅ Aceite: importo um OFX de 200+ transações, duplicatas são detectadas, regras aprendidas categorizam a próxima importação sozinhas.

### Fase 7 — Relatórios
- Entradas × saídas × saldo acumulado por período
- Tabela por categoria com drill-down, %, contagem, média e variação vs. período anterior
- Maiores variações, 20 maiores lançamentos, 10 estabelecimentos mais frequentes
- Evolução de patrimônio líquido (contas + investimentos − faturas abertas)
- Exportação CSV e PDF

✅ Aceite: números do relatório batem exatamente com a soma dos lançamentos filtrados.

### Fase 8 — Investimentos
- CRUD de posições com atualização **manual** de cotação (não integrar API de cotação agora)
- Aportes e resgates, preço médio, rentabilidade absoluta e percentual
- Alocação por classe com alvo e desvio
- Evolução patrimonial usando `PriceHistory`

✅ Aceite: preço médio recalcula corretamente após novo aporte.

### Fase 9 — Configurações, backup e deploy
- Perfil, tema, cor de acento, gestão de categorias (criar, mesclar), sessões ativas, notificações
- **Exportar tudo em JSON e CSV** e importar backup
- Zona de risco: apagar dados / excluir conta
- Job semanal de dump do banco para o R2
- PWA completo (manifest, ícones, offline shell)
- `docker-compose.yml` de produção + README de deploy

✅ Aceite: consigo exportar meu histórico inteiro e restaurar num banco limpo.

---

## 8. Armadilhas — evite desde o começo

1. **Pooler do Postgres**: se usar Neon/Supabase, `DATABASE_URL` aponta para o pooler (pgBouncer, porta 6543 no Supabase) e `DIRECT_URL` para a conexão direta, usada só nas migrations. Ignorar isso derruba o banco por esgotamento de conexões.
2. **BigInt no JSON**: `JSON.stringify` quebra com BigInt. Configure um serializer global no Nest e um reviver no cliente. Resolva isso na Fase 0, não na 5.
3. **Timeout de request**: importação, geração de recorrências e relatórios pesados vão para job ou query agregada no banco — nunca loop em memória sobre milhares de linhas.
4. **N+1 no Prisma**: use `include`/`select` explícitos nas listagens. O dashboard não pode fazer 40 queries.
5. **Agregação no banco**: totais por categoria, por mês e por conta são `groupBy` no Postgres, não `reduce` no Node.
6. **Seed realista**: crie um seed com ~5.000 lançamentos em 24 meses, 3 cartões, 4 contas, parcelamentos e recorrências. É o único jeito de perceber lentidão e erro de fatura cedo.
7. **CORS**: em produção web e api ficam no mesmo host (proxy `/api` no Next), então não configure CORS permissivo "só pra funcionar".

---

## 9. Deploy alvo

Uma VPS única com Coolify, tudo em Docker Compose: `web`, `api`, `postgres`. O front fala com a API por rede interna. Backup semanal automático para o R2. Prepare o projeto para isso desde a Fase 0 (variáveis de ambiente, `Dockerfile` por app, healthchecks), mas só configure de fato na Fase 9.

---

## 10. Como quero que você trabalhe

- Uma fase por vez. Terminou, testou, commitou, **parou**.
- Commits pequenos e descritivos em português (`feat: parcelamento gera transações por fatura`).
- Teste automatizado obrigatório para toda regra da Seção 5. Se uma regra não tem teste, a fase não está pronta.
- Antes de começar cada fase, me diga em 3 linhas o que vai fazer e quais decisões está tomando.
- Se algo na Seção 5 estiver ambíguo ou conflitar com outra regra, **pergunte antes de decidir sozinho**.
- Não adicione dependência, serviço externo ou abstração que não esteja aqui sem me consultar.
- Mantenha um `PROGRESS.md` na raiz com o que já foi feito, decisões tomadas e o que ficou pendente.

**Comece pela Fase 0.**