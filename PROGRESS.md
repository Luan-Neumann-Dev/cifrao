# PROGRESS — Cifrão

Registro do que foi feito, decisões tomadas e pendências. Uma seção por fase.

---

## Fase 0 — Fundação ✅

### Aceite verificado

- `pnpm lint`, `pnpm typecheck` (5/5), `pnpm test` (25 testes: 22 shared + 3 api) e `pnpm build` (4/4) — todos verdes.
- Postgres sobe via `docker compose up -d db`; API responde em `GET /health` com horário em `America/Sao_Paulo`; o web (server component) consome a API e renderiza **"API conectada"**.
- Nota: o `formatBRL` remove o espaço não-quebrável do `Intl` via regex com escapes unicode (U+00A0 e U+202F) — nada de NBSP literal no fonte (evita `no-irregular-whitespace`).

### O que foi feito

- **Monorepo** pnpm workspaces + Turborepo: `apps/web`, `apps/api`, `packages/shared`, `packages/db`.
- **`packages/shared`** — fonte única de tipos/helpers, com testes Vitest:
  - `money.ts`: `toCents`, `formatBRL`, `sumCents` (tudo em centavos `bigint`, regra 5.1).
  - `date.ts`: fuso `America/Sao_Paulo` com `monthKeyInSaoPaulo`, `formatInSaoPaulo`, `saoPauloToUtc` (regra 5.2).
  - `json.ts`: serializer global de BigInt + `stringifyWithBigInt` (armadilha #2).
- **`packages/db`** — Prisma inicializado (`datasource` com `url`/`directUrl`), client singleton (armadilha #1). Sem entidades ainda — o modelo da Seção 6 entra a partir da Fase 2.
- **`apps/api`** — NestJS 11 com `GET /health`; serializer de BigInt instalado no bootstrap; consome `@cifrao/shared`.
- **`apps/web`** — Next 15 (App Router) com página consumindo o health via proxy `/api/*` → API (sem CORS permissivo, armadilha #7). Tokens do design system em `globals.css`.
- **Infra dev**: `docker-compose.yml` (Postgres 16), `.env.example`, ESLint + Prettier + TS strict em todos os pacotes.

### Decisões tomadas

1. **Pacotes internos compilam para `dist/`** (`@cifrao/shared`, `@cifrao/db`) e o Turbo garante a ordem via `dependsOn: ["^build"]`. Consumo confiável tanto pelo Nest (tsc/commonjs) quanto pelo Next.
2. **Testes da Fase 0**: Vitest no `shared` (regras obrigatórias) + teste unitário do `HealthController` no `api` (instanciação direta, sem bootstrap). O **Supertest/e2e completo do Nest fica para a Fase 1**, onde avalio se preciso de `@swc/core` para o Vitest resolver DI com metadados de decorator — avisarei antes de instalar.
3. **Design tokens em CSS puro** por enquanto; migram para o `@theme` do Tailwind v4 quando a UI começar (evita meio-configurar o design system agora).
4. **Datas/dinheiro** só são formatados na camada de apresentação; persistência sempre em UTC/centavos.
5. **Proxy `/api/*` no Next** aponta para `API_INTERNAL_URL` (default `http://localhost:3001`), mesmo padrão que será usado atrás do Coolify.

### Pendências / notas para as próximas fases

- Afinar Vitest + NestJS (provável `@swc/core` + `unplugin-swc`) na Fase 1 para testes de integração com DI.
- Tailwind v4 + shadcn/ui + fontes (Inter/Manrope) entram junto da UI real.
- Primeira `prisma migrate` só quando surgirem entidades (Fase 1/2).

---

## Fase 1 — Auth ✅

### O que foi feito

- **Better Auth** (roda no Next, `apps/web/src/lib/auth.ts`): e-mail/senha + **TOTP 2FA** + **códigos de recuperação**, adapter Prisma.
- **Registro só para o 1º usuário** (regra da fase): gate em função pura testável (`registration.ts`) usada num `databaseHook.user.create.before`; depois disso, fechado — reabre com `REGISTRATION_OPEN=true`.
- **JWT via JWKS**: plugin `jwt` do Better Auth expõe o JWKS; uma server action grava o JWT num cookie **httpOnly `cifrao_api_jwt`** que o proxy encaminha ao Nest. O **guard do Nest** (`apps/api/src/auth`) valida o token com `jose` (`createRemoteJWKSet`), sem tocar no banco.
- **Rota protegida** de exemplo `GET /me` no Nest com `@CurrentUser()`.
- **Telas** (`app/(auth)/…` + `/painel`): login, criar conta, verificar 2FA, configurar 2FA (QR via `qrcode` + códigos), recuperar e redefinir senha; painel autenticado com teste de `/api/me` e logout. Tokens completos do design system em `globals.css` + primitivas de UI provisórias.
- **1ª migração Prisma**: entidades de auth (`User`, `Session`, `AuthAccount`, `Verification`, `TwoFactor`, `Jwks`).

### Decisões tomadas (Fase 1)

1. **Colisão de nomes resolvida**: o model de credenciais do Better Auth é `AuthAccount` (delegate `prisma.authAccount`), deixando `Account` livre para a **conta bancária** da Seção 6 (Fase 2). O `Session` do Better Auth cobre o `Session` da Seção 6. O `User` mantém os campos de domínio `theme`/`accentColor` via `additionalFields`.
2. **Validação no Nest = JWKS + `jose`** (decisão confirmada com o dono): sem hop de rede por request; o Nest não acessa o banco na Fase 1 (identidade vem do JWT).
3. **QR do TOTP com `qrcode`** (dep aprovada): o Better Auth entrega só o `otpauth://`.
4. **Proxy `/api/*` exclui `/api/auth/*`** (`next.config.ts`, rewrite `afterFiles` com negative-lookahead), pois esse prefixo é servido pelo handler do Better Auth no Next.
5. **Porta do Postgres em dev = `55432`**: a máquina já roda um Postgres nativo nas 5432/5433. Só afeta o dev; em produção a string vem do `.env`.

### Pendências / notas

- **Entrega de e-mail do reset de senha**: sem provedor no stack — em dev o link vai para o log do servidor (`sendResetPassword`). **Adicionar um provedor (Resend/SMTP) é um serviço externo e precisa da sua aprovação** antes de virar real.
- Vitest do `apps/web` está em `environment: node` (lógica pura). Quando houver componente a testar, avalio `jsdom` — aviso antes.
- `@swc/core` para e2e do Nest **não foi necessário**: o guard/JWT é testado por instanciação direta com chave local (sem servidor).

### Aceite verificado (Fase 1)

- **CI local verde**: `pnpm lint` (4/4), `pnpm typecheck` (6/6), `pnpm test` (**42 testes**: shared 22, api 15, web 5), `pnpm build` (4/4).
- **Smoke E2E (10/10)** com os serviços no ar: cadastro do 1º usuário ✓; **2º cadastro bloqueado (403)** ✓; JWT emitido ✓; **Nest valida o JWT via JWKS** ✓; proxy `/api/me` ✓; sem token → 401 ✓; **2FA enable + verify TOTP** ✓; sessão marca `twoFactorEnabled` ✓.

---

## Fase 2 — Contas + Categorias + Lançamentos (núcleo) ✅

### O que foi feito

- **Schema de domínio** (Prisma): `Account`, `Category` (hierárquica), `Tag` + `TransactionTag`, `Transaction`, `TransactionSplit` e enums (`AccountType`, `CategoryKind`, `TransactionType`, `TransactionStatus`), com os índices obrigatórios em `Transaction`.
- **Schemas Zod compartilhados** (`packages/shared`): fonte única de tipos (contas, categorias, tags, lançamentos, filtros, ações em lote). O Nest valida a entrada via `ZodValidationPipe`; o front infere os tipos.
- **Lógica pura de lançamentos** (`transaction-logic.ts`) com testes: classificação, `accountDeltaCents` (saldo mantido), somas de caixa e `computeAdjustmentDeltaCents` (5.8).
- **API (Nest)**: `PrismaService` global; CRUD de contas (com **ajuste de saldo 5.8** e **evolução de 6 meses**), categorias e tags; CRUD de lançamentos com **saldo mantido atomicamente** (create/update/delete/bulk dentro de `$transaction`), filtros (período, tipo, conta, categoria, tag, status, busca) + paginação, e ações em lote (categorizar, marcar efetivado, add tag, excluir).
- **Frontend (Next + Tailwind v4 + shadcn-style)**: telas de Contas (cards de saldo, criar/editar, ajustar) e Lançamentos (filtros, lista, seleção múltipla + barra de lote, criar/editar despesa/receita/transferência, **exclusão com "desfazer"** via toast). Visão geral com patrimônio, contas e últimos lançamentos. Tokens do design no `@theme` do Tailwind.
- **Seed**: 48 categorias BR padrão (+ "Ajuste"), idempotente. `seed:demo` gera ~4.700 lançamentos em 24 meses (armadilha #6).

### Decisões tomadas (Fase 2)

1. **Tailwind v4 + shadcn/ui agora** (aprovado): novas deps `tailwindcss`, `@tailwindcss/postcss`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`, `@radix-ui/react-dialog`, `@radix-ui/react-slot`. `zod` adicionado à API.
2. **Saldo mantido** (aprovado): `Account.balanceCents` é o saldo atual, atualizado na mesma transação de cada mutação; `FORECAST` não move saldo. Leitura O(1); ajuste (5.8) = real − atual.
3. **Transferência = 1 linha** `type=TRANSFER` com `from/to` (deriva da Seção 6); nunca entra em receita/despesa (5.7), garantido por teste puro + smoke no endpoint.
4. **Colisão de nomes**: mantida a decisão da Fase 1 (`AuthAccount` para credenciais; `Account` é a conta bancária).
5. **Exclusão com desfazer**: a UI remove otimisticamente e só confirma no servidor após o toast fechar (janela de "desfazer").
6. **`declaration: false`** nos apps (Nest/Next) — evita TS2742 ao expor tipos inferidos do Prisma; os pacotes de lib (shared/db) seguem emitindo `.d.ts`.

### Pendências / notas

- Cartões, faturas e parcelamento (`creditCardId`/`invoiceId`/`purchaseId` em `Transaction`) entram na Fase 3.
- Exclusão de conta é bloqueada quando há lançamentos (arquivar). Mesclar categorias fica para a Fase 9.
- API carrega `.env` em dev via `process.loadEnvFile()` (arquivo `apps/api/.env`).

### Aceite verificado (Fase 2)

- **CI local**: `pnpm lint`, `pnpm typecheck`, `pnpm test` (**54 testes**: shared 34, api 15, web 5), `pnpm build` — todos verdes.
- **Smoke funcional E2E (9/9)** pela API real (via proxy): despesa debita, receita credita, transferência move as duas contas; **filtro `EXPENSE` não inclui a transferência (5.7)**; **ajuste 5.8** cria `ADJUSTMENT` da diferença e reconcilia o saldo; excluir reverte o saldo.
- **Performance**: lista paginada de 50 sobre **4.704 lançamentos em ~89ms**; `/accounts` em ~9ms.

---

## Fase 3 — Cartões e faturas ✅

### O que foi feito

- **Schema** (Prisma): `CreditCard`, `Invoice` (com `@@unique([creditCardId, referenceMonth])`), `Purchase` (compra pai de parcelamento) + enum `InvoiceStatus`; campos de cartão em `Transaction` (`creditCardId`, `invoiceId`, `purchaseId`, `installmentNumber`, `installmentTotal`) e índice `@@index([invoiceId])`. Migração `cartoes_faturas`.
- **Lógica pura** (`packages/shared/card-logic.ts`), toda testada: `invoiceWindowForPurchase`/`resolveClosingMonth` (roteamento 5.3), `installmentWindows`/`installmentDateParts`/`splitInstallments` (parcelamento 5.4), `classifyInvoicesForAvailability` (disponível de verdade 5.5) e `deriveInvoiceStatus`.
- **API**: `CreditCardsModule` — CRUD de cartão; `POST /credit-cards/:id/purchases` (gera 1 `Purchase` + N `Transaction` roteadas p/ N faturas); `GET /credit-cards/:id` com disponível de verdade e faturas; `GET /credit-cards/:id/commitment` (12 meses, `groupBy` no banco); `GET /invoices/:id` e `POST /invoices/:id/pay` (pagamento total/parcial).
- **Frontend**: aba "Cartões"; lista com disponível de verdade; detalhe com os 3 números do disponível + explicação (5.5), gráfico de comprometimento 12 meses (Recharts), faturas com status, expandir lançamentos, pagar fatura e nova compra parcelada com **prévia** "entra na fatura de …".

### Decisões tomadas (Fase 3) — confirmadas com o dono

1. **Corte da fatura inclusivo** (5.3): compra no dia do fechamento entra na fatura que fecha naquele dia; a partir do dia seguinte, na próxima. `referenceMonth` = mês do **vencimento** ("fatura de agosto fecha 28/07"). Dias > nº de dias do mês são fixados no último dia.
2. **Disponível de verdade** (5.5): `limite − fatura aberta − faturas fechadas não quitadas − parcelas futuras`. Faturas fechadas e não pagas também consomem limite; os três números são exibidos separadamente.
3. **Pagamento de fatura** (5.6): `Transaction type=TRANSFER` com `fromAccountId` + `invoiceId` (sem `toAccountId`). Debita a conta, soma `paidCents`, atualiza status (PARTIAL/PAID) e **nunca** conta como despesa (reaproveita a exclusão de TRANSFER de 5.7).
4. **Compra de cartão é EXPENSE** sem `accountId`: conta como gasto (5.7 continua valendo) mas **não** move saldo de conta — o saldo só se mexe quando a fatura é paga (a transferência de 5.6).
5. **Total da fatura é derivado** (soma das compras EXPENSE não-FORECAST); `paidCents`/`status` são persistidos. `OPEN↔CLOSED` é derivado por data; a persistência formal do fechamento entra com o cron na Fase 5.

### Pendências / notas

- **Edição da compra pai propagando p/ parcelas futuras** (trecho final de 5.4): editar/excluir parcela individual já funciona pelo endpoint genérico; a edição em cascata a partir do `Purchase` fica como refinamento (não está nos critérios de aceite desta fase).
- Excluir um pagamento de fatura pelo endpoint genérico credita a conta de volta, mas **não** reverte `paidCents` da fatura — pagamentos devem ser geridos pela tela da fatura. A reversão de `paidCents` entra quando houver "estorno de pagamento".
- Recharts adicionado (`^3.10.1`, do stack aprovado). A página de detalhe do cartão carrega ~115 kB por causa do gráfico — aceitável; dá para lazy-load depois.

### Aceite verificado (Fase 3)

- **CI local**: `pnpm lint`, `pnpm typecheck`, `pnpm test` (**77 testes**: shared 51, api 21, web 5) e `pnpm build` — todos verdes.
- **Testes automatizados das regras**: 5.3/5.4/5.5 em `card-logic.test.ts` (17); 5.4 (6x → 6 faturas, Purchase pai, soma exata) em `credit-cards.service.test.ts`; 5.6 (pagamento é TRANSFER, debita conta, PAID/PARTIAL) em `invoices.service.test.ts`.
- **Smoke funcional E2E (15/15)** pela API real (via proxy): 6x cai em 6 faturas distintas e consecutivas; parcela numerada na fatura certa; virada na data de fechamento (dia 28 → fatura atual, dia 29 → próxima); disponível = limite − comprometido; **pagar fatura não cria despesa**, debita a conta, marca PAID e libera limite.

---

## Fase 4 — Dashboard ✅

### O que foi feito

- **Endpoint único** `GET /dashboard?month=yyyy-MM` (`DashboardModule`) que agrega tudo em **~9 queries paralelas** com `groupBy` no banco (armadilha #5): saldos, disponível de verdade até o fim do mês, faturas abertas, gastos por categoria, totais do mês, timeline, patrimônio e insight.
- **Lógica pura** (`packages/shared/dashboard-logic.ts`), testada: `computeAvailableEndOfMonthCents` (regra 5.11) e `pickTopInsight` (insight do mês).
- **Tela `/painel` reconstruída**: hero "disponível de verdade até o fim do mês" com o detalhamento (saldo + previstos − previstos − cartão); cards de disponível hoje e patrimônio; totais do mês; timeline "o que vem por aí"; **gastos por categoria** (donut Recharts + legenda, **filtro por clique** → `/lancamentos` pré-filtrado por categoria e período); faturas abertas; insight do mês; últimos lançamentos; e orçamento com estado-vazio.
- **Filtro por clique**: a tela de lançamentos passou a semear os filtros a partir da URL (`categoryId`, `from`, `to`, …), habilitando o drill-down do dashboard.

### Decisões tomadas (Fase 4) — confirmadas com o dono

1. **Escopo**: não puxei `Budget`/`RecurringRule` (Fase 5) para cá. Orçamento aparece com **estado-vazio** honesto; os "previstos" usam os `FORECAST` já existentes. Ambos são plugados na Fase 5.
2. **Disponível de verdade até o fim do mês** (5.11): `saldo líquido hoje (contas não-investimento) + receitas previstas até o fim do mês − despesas previstas até o fim do mês − TODO o comprometido do cartão (faturas abertas + parcelas futuras)`. Pode ficar negativo (alerta de estouro).
3. **Saldo disponível hoje** = soma das contas **não-investimento**; **patrimônio** = todas as contas − faturas em aberto (investimentos entram na Fase 8).
4. **Insight do mês** = categoria com o maior estouro (delta positivo) vs. a **média dos últimos 3 meses**; ignora lançamentos sem categoria.
5. Transferências/ajustes continuam fora dos gastos por categoria e dos totais do mês (5.7), pois os `groupBy` filtram `type in (EXPENSE, INCOME)`.

### Pendências / notas

- Orçamento resumido e geração automática de previstos entram na Fase 5 (o dashboard já tem os pontos de encaixe).
- A tela `/painel` carrega ~284 kB (Recharts); dá para `next/dynamic` com lazy-load do gráfico depois, se incomodar.

### Aceite verificado (Fase 4)

- **CI local**: `pnpm lint`, `pnpm typecheck`, `pnpm test` (**83 testes**: shared 57, api 21, web 5) e `pnpm build` — todos verdes.
- **Performance**: `GET /dashboard` sobre **4.704 lançamentos** = **min 19ms / p50 23ms / máx 33ms** em 10 chamadas — folgadamente abaixo do alvo de 1s.
- Regra 5.11 (disponível até o fim do mês) e o insight do mês cobertos por teste puro em `dashboard-logic.test.ts`.

---

## Fase 5 — Recorrências, orçamento e metas ✅

### O que foi feito

- **Schema** (Prisma, migração `recorrencias_orcamento_metas`): `RecurringRule` (+ enum `RecurrenceFrequency`: WEEKLY/MONTHLY/QUARTERLY/YEARLY), `Budget` (`@@unique([categoryId, month])`), `Goal` (aponta para `Account`), campo `recurringRuleId` em `Transaction` com `onDelete: SetNull` e índices `@@index([recurringRuleId, date])` / `@@index([status, date])`.
- **Lógica pura** (`packages/shared`), toda testada: `recurrence-logic.ts` (`occurrencesUntil`, `occurrencesBetween`, `nextOccurrences` — 5.11), `budget-logic.ts` (`computeBudgetStatus`, `daysRemainingInMonth`, `suggestLimitCents` — 5.10) e `goal-logic.ts` (`computeGoalProgress`, `goalOnTrack` — 5.9).
- **API**: `RecurringModule` (CRUD + geração de previstos com horizonte rolante de 12 meses + `POST /recurring-rules/generate` + **cron diário às 03:00 SP** via `@nestjs/schedule`); `BudgetsModule` (lista com gasto/restante/média diária, upsert, sugestão pela média de 3 meses e aplicação em lote); `GoalsModule` (CRUD + progresso lido do saldo vinculado + ETA); `CalendarModule` (`GET /calendar` com saldo projetado dia a dia); `ReceivablesModule` (`GET /receivables`, regra 5.13). O **dashboard** ganhou `budgetSummary` (reaproveitando o `groupBy` de gastos por categoria).
- **Frontend**: telas de **Recorrências** (prévia das 3 próximas datas, pausar/reativar, efetivar previsto), **Orçamento** (navegação por mês, barras, média diária, diálogo de sugestão de limites), **Metas** (progresso, ETA, aviso de que não move dinheiro), **Calendário** (área Recharts do saldo projetado, ponto mais baixo, alerta de saldo negativo, eventos por dia) e **A receber** (pendentes, marcar recebido, histórico). Nav virou pill-row rolável (9 seções em 380px) e o card de orçamento do painel deixou de ser estado-vazio.

### Decisões tomadas (Fase 5) — confirmadas com o dono

1. **Recorrência cobre só conta** (EXPENSE/INCOME/TRANSFER) nesta fase. Assinatura lançada no cartão ficou de fora: exigiria decidir se previsto entra no total da fatura e no "disponível de verdade" — hoje não entra.
2. **ETA da meta** = ritmo histórico (variação média mensal do saldo vinculado nos 3 meses completos anteriores, agregada no banco); sem histórico positivo, cai para o `monthlyContributionCents` declarado; sem os dois, não há ETA (nunca se inventa prazo).
3. **Calendário desconta a fatura no vencimento**, como evento de fatura marcado — nunca como despesa (5.6). Vencimento já passado e não pago vira alerta, não projeção.
4. **Horizonte rolante de 12 meses**, regerado a cada mudança na regra e pelo cron diário. A geração é **idempotente**: apaga e reescreve só os previstos de hoje em diante, e **nunca recria uma data já efetivada** (evita duplicata quando um previsto vira lançamento).
5. **Confirmar previsto = `PATCH /transactions/:id { status: 'CLEARED' }`** — reaproveita o caminho de saldo já testado da Fase 2, sem endpoint novo.
6. **Excluir regra preserva histórico**: remove os previstos futuros e desliga o vínculo (`SetNull`) do que já foi efetivado.
7. **5.13 com estorno vinculado** (revisto após a Fase 5 — ver adendo abaixo).
8. **Base da projeção do calendário** = saldo mantido de hoje (contas não-investimento). Dias passados são reconstruídos para trás com os realizados; meses inteiramente passados/futuros usam um ajuste agregado no banco.

### Pendências / notas

- O cron roda em **toda instância** da API. Com uma só (o alvo do Coolify) está correto; se um dia houver réplica, precisa de lock — a fila do pg-boss da Fase 6 resolve isso.
- `nextDates` da regra é calculado no servidor a cada listagem (barato, lógica pura); não é persistido.
- Recorrência não altera lançamentos previstos **passados** — eles ficam como estavam até o usuário confirmar ou excluir.
- Editar a regra troca tipo/contas não é suportado (é excluir e recriar), mesmo padrão do lançamento na Fase 2.

### Aceite verificado (Fase 5)

- **CI local**: `pnpm lint` (4/4), `pnpm typecheck` (6/6), `pnpm test` (**118 testes**: shared 80, api 33, web 5) e `pnpm build` (4/4) — todos verdes.
- **Aceite 1 — "uma recorrência mensal gera previstos corretos por 12 meses"**: coberto por teste puro (`recurrence-logic.test.ts`), teste de serviço (`recurring-rules.service.test.ts`) e **smoke na API real**: 12 previstos, 12 meses consecutivos e distintos, todos no dia 10 no fuso de SP, todos `FORECAST`, **sem mover saldo**.
- **Aceite 2 — "meta nunca cria saldo novo"**: teste de serviço com Prisma fake que **falha se houver qualquer escrita** em conta ou lançamento, mais smoke real: criar/editar/excluir meta não altera saldo, não cria lançamento e não mexe no patrimônio.
- **Smoke funcional E2E (41/41)** pela API real (via proxy): regeneração idempotente sem duplicar mês já efetivado; efetivar previsto debita a conta; orçamento com gasto/restante/média diária e **transferência fora do orçamento (5.7)**; dashboard com `budgetSummary`; calendário ancorado no saldo líquido de hoje; reembolsável entra e sai de "A receber".
- **Performance** com **5.012 lançamentos**: `/calendar` p50 32ms, `/dashboard` p50 17ms, `/budgets` p50 13ms, `/goals` p50 8ms, `/recurring-rules` p50 10ms, `/receivables` p50 13ms.

---

## Adendo à Fase 5 — Reembolso com estorno vinculado (regra 5.13) ✅

Revisão da decisão 7 da Fase 5, tomada junto com o dono antes de abrir a Fase 6 —
de propósito: os relatórios da Fase 7 ainda não existem, então as queries já
nascem sabendo abater reembolso, em vez de virar retrabalho depois.

### O problema com a versão anterior

"Marcar como recebido" só gravava `reimbursedAt`. Duas consequências: o dinheiro
que voltou **não entrava no saldo** (o botão dizia "Recebi" e nada se movia), e o
gasto reembolsado **continuava consumindo o orçamento** da categoria.

### O que foi feito

- **Schema** (migração `reembolso_estorno_vinculado`): auto-relação
  `Transaction.reimbursesTransactionId` → `reimbursements[]`, com
  `onDelete: Restrict` e `@@index([reimbursesTransactionId])`.
- **`POST /transactions/:id/reimburse`** (`{ accountId, amountCents?, date? }`):
  cria um `INCOME` vinculado que **credita a conta escolhida** e **herda a
  categoria do gasto**. Sem `amountCents`, estorna o que falta. **Suporta
  parcial**: enquanto os estornos não cobrem o valor, o gasto continua em "A
  receber" com barra de progresso. `DELETE /transactions/:id/reimburse` desfaz.
- **Agregações líquidas** (`common/expense-aggregates.ts`): gasto por categoria
  passa a ser bruto − estornos, e a receita do mês **exclui estornos**. Usado por
  orçamento (mês e janela de sugestão), gastos por categoria, totais do mês e
  insight.
- **Lógica pura**: `isReimbursementRefund` + `sumExpenseCents`/`sumIncomeCents`/
  `sumByCategory` netando o estorno.
- **Exclusão segura**: apagar um gasto reembolsado remove os estornos **revertendo
  o saldo** (`deleteWithRefunds`), nunca por cascade do banco; apagar um estorno
  recalcula o `reimbursedAt` do gasto (`syncReimbursedAt`). Vale para exclusão
  simples e em lote.
- **UI**: "Recebi" abre diálogo com conta de destino e valor (padrão = o que
  falta); pendentes parciais mostram quanto voltou e quanto falta; "desfazer"
  remove os estornos.

### Decisões

1. **Estorno é atribuído ao mês e à categoria do gasto ORIGINAL**, não à data em
   que o dinheiro voltou. Um almoço de julho reembolsado em agosto deixa de pesar
   no orçamento de **julho** — que é a pergunta real ("quanto eu gastei em
   julho?"). Efeito colateral aceito: um mês fechado pode mudar retroativamente.
2. **Estorno nunca é receita.** Sem isso, um mês com R$ 3.000 de reembolsos
   apareceria como "receita 8.000 / despesa 8.000" em vez de 5.000 / 5.000.
3. **No saldo, estorno é entrada normal** (`accountDeltaCents` não muda): o
   dinheiro voltou de verdade. Só a leitura de relatório é que difere.
4. Só **despesa efetivada e marcada como reembolsável** pode ser estornada
   (previsto e receita são recusados com mensagem explícita).

### Aceite verificado (adendo)

- **CI local**: lint (4/4), typecheck (6/6), `pnpm test` (**135 testes**: shared
  89, api 41, web 5), build (4/4) — verdes.
- **Testes de regra**: `reimbursement-logic.test.ts` (9, lógica pura: estorno
  credita saldo, não é receita, abate a categoria, parcial) e
  `reimbursement.service.test.ts` (8, serviço: vínculo, herança de categoria,
  crédito na conta, parcial mantém pendente, travas, desfazer devolve o saldo).
- **Smoke E2E (28/28)** na API real: reembolso total zera o gasto no orçamento e
  devolve o saldo; **receita do mês não infla**; parcial deixa o restante
  pendente e cobra só a diferença no orçamento; desfazer devolve o dinheiro e o
  gasto volta a pesar; excluir gasto reembolsado leva o estorno junto com o saldo
  fechando. O smoke da Fase 5 seguiu verde (**42/42**).

### Pendências

- O gasto reembolsável ainda consome **limite de cartão** normalmente quando é
  compra no cartão — o estorno credita a conta, não a fatura. Estorno na própria
  fatura é outro caso (5.6) e não foi tocado.
- Relatórios da Fase 7 devem usar `netExpenseByCategory`/`netIncomeCents` em vez
  de `groupBy` cru, senão o abatimento se perde.

---

## Fase 6 — Importação ✅

### O que foi feito

- **Schema** (migrações `importacao_staging_regras` e `importacao_previa_e_match_previsto`): `ImportBatch` + `ImportRow` (staging), `CategoryRule`, enums `ImportFormat`/`ImportStatus`/`ImportRowStatus`, e em `Transaction` os campos `externalId` (FITID do OFX) + relações de importação.
- **Fila pg-boss** (`queue/queue.service.ts`): sobe no próprio Postgres, schema `pgboss`, conexão pela `DIRECT_URL`. Duas filas: `import.process` e `import.confirm`. A API sobe mesmo sem fila (só a importação fica indisponível, com mensagem clara).
- **Parsers** (`imports/parsers/`), nenhum escrito à mão: `ofx-js` (OFX de conta **e** de cartão), `papaparse` (CSV com `;`/`,`/tab e par débito/crédito) e `qif-ts` (QIF). Detecção de formato pelo **conteúdo**, com a extensão só como desempate. Charset `windows-1252` tratado no servidor.
- **Lógica pura** (`shared/import-logic.ts`), testada: normalização de descrição, similaridade por trigramas, `findDuplicate`, motor de `matchCategoryRule`, `suggestRulePattern`/`countMatchingPattern` e as datas de extrato (`parseOfxDate`, `parseStatementDate`, `detectDateFormat`).
- **API**: `POST /imports` (upload base64 → enfileira), `GET /imports/:id` (estado + linhas + contagens), `PATCH /imports/:id/mapping` (CSV), `PATCH /imports/:id/rows/:rowId`, `POST /imports/:id/apply-pattern`, `GET /imports/:id/pattern` (o "N" do botão), `POST /imports/:id/confirm`, e CRUD de `/category-rules` com `GET /category-rules/test`.
- **Frontend**: `/painel/importar` (upload, lista com progresso do job), `/painel/importar/[id]` (mapeamento de colunas com prévia de 5 linhas, tabela de revisão com duplicata e sugestão de categoria, diálogo "aplicar a todos e criar regra", barra de confirmação) e `/painel/regras` (CRUD + testador de descrição).

### Decisões tomadas (Fase 6) — confirmadas com o dono

1. **Arquivo fica no Postgres** (`ImportBatch.rawContent`, base64) nesta fase. O R2 entra na Fase 9 junto com anexos e backup, atrás de uma interface de storage — assim a fase inteira é testável sem credencial de serviço externo.
2. **QIF via `qif-ts`** (dep nova aprovada): zero dependências transitivas, escrito em TypeScript. A alternativa `qif2json` puxava 4.
3. **"Descrição similar" = trigramas** com duas etapas: se todas as palavras significativas de uma descrição aparecem na outra, é o mesmo estabelecimento com ruído do banco (vale 1); senão, coeficiente de Dice. Limiar 0,6. A comparação é **por palavra inteira**, então "UBER" não casa com "UBERABA SUPERMERCADO".
4. **FITID ganha da heurística**: quando o OFX traz `FITID`, a duplicata é exata (score 1) e o campo é gravado em `Transaction.externalId`, o que torna reimportação do mesmo arquivo 100% detectável.
5. **Estorno da 5.11 fechado aqui**: uma linha que casa com um `FORECAST` da mesma conta marca `matchedForecastId`; na confirmação o previsto **vira efetivado** em vez de nascer um lançamento duplicado ao lado.
6. **Upload em base64 no corpo JSON** (limite de 12 MB, `API_BODY_LIMIT`), sem multer: extrato BR costuma vir em `windows-1252` e decodificar no servidor evita corromper acento — o que estragaria descrição, similaridade e regra.
7. **Padrão de regra é gravado normalizado**, do mesmo jeito que o motor compara, para "IFD*IFOOD" e "ifd ifood" nunca virarem duas regras.

### Armadilha resolvida (vale para as próximas fases)

`pg-boss@12` e `ofx-js@1` são publicados **só como ESM**, mas a API compila para CommonJS e roda no **Node 20**, onde `require()` de ESM quebra. A solução está isolada em [`apps/api/src/common/esm.ts`](apps/api/src/common/esm.ts): tenta o `import()` nativo (que funciona sob o Vitest) e cai para um `import()` preservado por `new Function` (que o TypeScript não rebaixa para `require`) no bundle CommonJS. Os tipos continuam corretos via `import type`, que some na compilação. **Quando a API virar ESM ou o Node 22 for o mínimo, esse arquivo pode sumir.**

### Pendências / notas

- O `rawContent` fica no Postgres; um extrato muito grande (> 12 MB) é recusado pelo `API_BODY_LIMIT`. Migrar para o R2 na Fase 9 resolve os dois pontos.
- Reimportar depois de trocar a conta do lote refaz o staging (a duplicata depende da conta) — isso descarta a categorização manual já feita naquele lote.
- Desfazer uma importação confirmada não existe: hoje é excluir os lançamentos pela tela de Lançamentos. Um "desfazer lote" caberia na Fase 9.
- QIF com decimal brasileiro depende de como o `qif-ts` lê o número; OFX e CSV foram testados com vírgula decimal e passam.

### Aceite verificado (Fase 6)

- **CI local**: `pnpm lint` (4/4), `pnpm typecheck` (6/6), `pnpm test` (**183 testes**: shared 121, api 57, web 5) e `pnpm build` (4/4) — todos verdes.
- **Aceite da fase, provado por smoke E2E (43/43)** na API real:
  - **OFX de 220 transações** importado: formato e conta (`12345-6`) detectados do arquivo, 220 linhas em staging, progresso a 100%.
  - **Nada gravado antes de confirmar**: zero lançamentos e saldo intacto durante toda a revisão.
  - **Duplicatas detectadas**: reimportar o mesmo arquivo marcou **as 220 linhas** como duplicata (score 1, dedupe por FITID), apontando o lançamento original, e a confirmação foi barrada.
  - **Regras aprendidas categorizam sozinhas**: "aplicar a todos" criou a regra `uber`; num arquivo novo, **todas** as linhas de Uber chegaram já categorizadas, cada uma dizendo qual regra a gerou.
  - **CSV**: pediu mapeamento, devolveu cabeçalhos e prévia limitada a 5 linhas (com 7 no arquivo), leu decimal brasileiro e preservou acento (`MERCADO SÃO JOÃO`).
  - **Regra 5.11**: linha casou com o previsto, a confirmação **efetivou o previsto** sem criar duplicado e o saldo mexeu uma única vez.
- **Testes de regra**: `import-logic.test.ts` (25) e `parsers.test.ts` (16) cobrem normalização, similaridade, janela de ±3 dias, precedência do FITID, motor de regras, formatos de data, charset e os três parsers.
- **Regressão**: os 10 endpoints das fases anteriores conferidos após a mudança global no `main.ts` — todos respondendo.

---

## Fase 7 — Relatórios ✅

### O que foi feito

- **Endpoint único** `GET /reports?from&to&accountId` com tudo agregado no Postgres: totais com variação, série de entradas × saídas × saldo acumulado, tabela por categoria, maiores variações, 20 maiores lançamentos, 10 estabelecimentos mais frequentes e evolução do patrimônio líquido.
- **Lógica pura** (`shared/report-logic.ts`), testada: `previousPeriod`, `computeVariation`, `percentOf`, `averageCents`, `accumulateSeries`, `buildCategoryReport`, `biggestVariations` e os helpers de CSV (`csvCell`/`toCsv`).
- **Exportação CSV** (`GET /reports/export?section=`) em 4 recortes (categorias, lançamentos, série, estabelecimentos), com `;` e BOM — o Excel pt-BR abre sem perguntar nada. Cada linha traz o valor em **centavos** e em BRL, para dar para conferir a soma na planilha.
- **Exportação PDF pela impressão do navegador**: folha `@media print` em `globals.css` que troca os tokens para a versão clara, esconde nav e botões, e marca os cartões com `break-inside: avoid`.
- **Tela `/painel/relatorios`**: presets de período (mês, mês passado, 3 meses, ano, livre), filtro por conta, gráficos Recharts (barras de entradas × saídas, área do acumulado, linha do patrimônio), tabela por categoria com **drill-down por clique** para `/lancamentos` já filtrado, e botões de CSV/PDF.

### Decisões tomadas (Fase 7) — confirmadas com o dono

1. **PDF é a impressão do navegador** (zero dependência nova): o botão dispara `window.print()` sobre um layout de impressão. Sai idêntico ao app, com as fontes certas, e você escolhe "Salvar como PDF".
2. **Período anterior = janela imediatamente anterior.** Com um ajuste que a implementação exigiu: **mês cheio compara com mês cheio**. Março (31 dias) contra fevereiro (28) por tamanho fixo cairia em 29/01 e misturaria dois meses — foi o que o smoke pegou. Para recorte livre continua valendo a janela do mesmo tamanho colada antes.
3. **Patrimônio usa contas do tipo INVESTMENT** até a Fase 8 trazer as posições reais, igual ao dashboard já fazia.
4. **Dívida de cartão no histórico é histórica de verdade**: compras de cartão lançadas até a data menos pagamentos de fatura feitos até a data — não a foto de hoje projetada para trás.
5. **Estabelecimento é agrupado no Postgres** por descrição normalizada (`translate` + `regexp_replace`), numa normalização mais grossa que a do `import-logic`: derruba todo dígito, para juntar "IFOOD *PEDIDO 123" e "IFOOD *PEDIDO 987".
6. **Contagem por categoria não é abatida pelo estorno**: o reembolso abate o **valor**, mas a despesa aconteceu. A média usa o valor líquido sobre a contagem cheia.

### Bug de fuso corrigido no caminho

`to=2026-03-31` chegava como `z.coerce.date()` → meia-noite **UTC**, que em São Paulo ainda é dia 30 — o relatório perdia o último dia do mês inteiro. Agora `from`/`to` são strings `yyyy-MM-dd` interpretadas como **dias de calendário de São Paulo**, com `to` cobrindo até 23:59:59 (regra 5.2). Vale a pena olhar se algum filtro de outra tela tem o mesmo problema.

### Pendências / notas

- A tabela por categoria cobre **despesas**. Receita por categoria não foi pedida na Seção 7 e ficou de fora.
- `/reports` filtra por conta, mas não por categoria ou tag — o drill-down cobre isso levando para `/lancamentos`.
- O gráfico de patrimônio começa no mês do início do período; para ver a série longa, escolha um período longo.
- Impressão testada só na folha de estilo; **vale você conferir o resultado no seu navegador** e me dizer se alguma quebra de página ficou ruim.

### Aceite verificado (Fase 7)

- **CI local**: `pnpm lint` (4/4), `pnpm typecheck` (6/6), `pnpm test` (**201 testes**: shared 139, api 57, web 5) e `pnpm build` (4/4) — todos verdes.
- **Aceite da fase — "os números batem exatamente com a soma dos lançamentos filtrados" — provado por smoke E2E (41/41)**, e provado do jeito certo: cada número do relatório é comparado com uma **soma independente** vinda do endpoint de lançamentos, não com valor escrito à mão no teste.
  - despesa, receita, líquido e contagem do relatório = soma dos lançamentos filtrados;
  - **transferência e ajuste existem no período e ficam fora** dos dois totais (5.7 e 5.8);
  - soma das categorias = total de despesa; soma da série = total; **acumulado final = líquido do período**;
  - **estorno de reembolso abate a despesa e não vira receita** (5.13), inclusive na série;
  - período de comparação correto (01–28/02 para março) e período cobrindo o dia 31;
  - último ponto do patrimônio = saldo real das contas hoje;
  - **somar a coluna de centavos do CSV dá exatamente o total do relatório**, e o arquivo sai com BOM UTF-8.
- **Regressão**: smoke da Fase 6 (43/43) e os 10 endpoints das fases anteriores, todos verdes.

---

## Fase 8 — Investimentos ✅

### O que foi feito

- **Schema** (migração `investimentos`): `Investment`, `InvestmentTransaction`, `PriceHistory`, `AllocationTarget` + enums `InvestmentClass`/`InvestmentSource`/`InvestmentTransactionType`.
- **Lógica pura** (`shared/investment-logic.ts`), testada: `toQuantity`/`formatQuantity` (quantidade é inteiro na escala 1e-8, para cripto ter fração sem float), `costOfCents`, `averagePriceCents`, `applyContribution`, `applyRedemption`, `positionMetrics` e `allocationByClass`.
- **API**: CRUD de posições, `POST /investments/:id/contribute` e `/redeem`, `PATCH /investments/:id/price` (cotação manual que grava ponto no `PriceHistory`), `PUT /investments/targets`, `DELETE /investments/:id/trades/:tradeId` (desfaz devolvendo o dinheiro) e `GET /investments` com totais, posições, alocação e evolução de 12 meses.
- **Patrimônio integrado**: dashboard e relatório passaram a somar a carteira a preço de mercado. O relatório reconstrói a carteira **mês a mês** pelo `PriceHistory` (`common/portfolio.ts`), não projeta a foto de hoje para trás.
- **Tela `/painel/investimentos`**: card do valor da carteira com rentabilidade, donut de alocação, barras por classe com alvo e "faltam R$ X para bater o alvo", lista de posições com aportar/resgatar/cotação, e gráfico de evolução.

### Decisões tomadas (Fase 8) — confirmadas com o dono

1. **Aportar tira o dinheiro da conta.** É o que impede o mesmo real de existir na conta e na carteira ao mesmo tempo: patrimônio = contas + valor de mercado das posições − faturas. A conta do tipo `INVESTMENT` passa a significar "caixa parado na corretora", não "meus investimentos".
2. **Conta de origem é opcional**: sem conta, registra só a posição — serve para cadastrar carteira antiga sem inventar histórico bancário.
3. **Classe é lista fixa BR**: Ações, FIIs, Renda Fixa, Tesouro, Fundos, Cripto, Internacional e Outros.
4. **O movimento de caixa é `TRANSFER`** (regra 5.7): comprar ativo não é despesa, e por isso não polui orçamento nem relatório.
5. **Custo investido é a fonte da verdade; preço médio é derivado dele.** Guardar o preço médio e recalcular em cima dele mesmo acumularia erro de arredondamento a cada aporte — há teste com 50 aportes de preço "feio" provando que não acumula.
6. **Venda não altera o preço médio** (regra brasileira): reduz a quantidade, realiza o lucro e baixa o custo proporcionalmente. Taxas entram no custo da compra e saem do valor da venda.
7. **Desfazer operação recalcula a posição do zero** a partir das operações restantes — mais confiável que tentar subtrair a operação removida do estado atual.

### Pendências / notas

- **Quantidade tem 8 casas decimais**; preço unitário é inteiro em centavos, então ativo que custa menos de R$ 0,01 por unidade não é representável. Não afeta ação, FII, tesouro nem cripto em reais.
- **Sem API de cotação** (a Seção 7 pede manual nesta fase). Cada atualização manual vira um ponto no `PriceHistory`; a evolução usa a última cotação até cada mês e, sem nenhuma, cai para o preço médio pago.
- `portfolioValueByMonth` percorre as operações em memória por mês. Com carteira pessoal (dezenas de posições) é irrelevante; se um dia virar centenas, vira SQL.
- A tela não tem edição/arquivamento de posição pela UI (o endpoint existe).
- O smoke da Fase 7 foi atualizado: a fórmula do patrimônio mudou de propósito nesta fase.

### Aceite verificado (Fase 8)

- **CI local**: `pnpm lint` (4/4), `pnpm typecheck` (6/6), `pnpm test` (**237 testes**: shared 165, api 67, web 5) e `pnpm build` (4/4) — todos verdes.
- **Aceite da fase — "preço médio recalcula corretamente após novo aporte"** — coberto por teste puro e por smoke na API real: 10 a R$ 20,00 + 10 a R$ 30,00 = médio **R$ 25,00**; + 5 a R$ 26,00 = médio **R$ 25,20** (ponderado, não média simples).
- **Smoke E2E (36/36)**, com destaque para o risco central da fase:
  - conta debitada **exatamente** pelos aportes; cada aporte virou lançamento `TRANSFER`; **comprar ativo não aparece como gasto**;
  - resgate credita a conta, **não altera o preço médio** e registra o lucro realizado;
  - aporte sem conta não move saldo nenhum;
  - alocação com alvo, desvio e "quanto falta comprar"; soma das posições = total da carteira; alvos acima de 100% recusados;
  - **patrimônio = contas + carteira − faturas** no dashboard e no relatório;
  - desfazer o aporte devolve o dinheiro e recalcula a posição.
- **Regressão**: smoke da Fase 7 (41/41) e os 10 endpoints das fases anteriores, verdes.

---


## Fase 9 — Configurações, backup e deploy ✅

> Fechada em dois commits, a pedido do dono: o primeiro entregou o backend
> (configurações, avisos e backup) e o segundo, o front, o PWA e o deploy. As
> duas partes estão descritas abaixo, na ordem em que foram feitas.

### Decisão que abriu a fase — storage

Antes de começar, o dono perguntou sobre trocar o Postgres pelo **Turso** e se o
**R2 é gratuito**. As duas respostas viraram decisão:

1. **Turso está fora.** Turso é libSQL, ou seja, SQLite, e o `pg-boss` roda
   *dentro* do Postgres (`LISTEN/NOTIFY`, `SKIP LOCKED`, advisory locks, schema
   próprio). Não existe versão dele para SQLite, e desde a Fase 6 **toda a
   importação é job de fila** — trocar o banco seria reescrever a camada de fila,
   não migrar dados. Somando: 19 `groupBy`, 12 enums e 3 colunas `Json`.
2. **O limite de 500 MB nunca foi um problema.** O deploy alvo (Seção 9) é uma
   VPS com Coolify e o **Postgres em container no próprio servidor** — o disco é
   o da VPS. E a escala real do app é pequena: o banco de desenvolvimento inteiro
   tem **13 MB** com 1.205 lançamentos e 2.537 linhas de importação, ou seja
   ~1,25 KB por lançamento com índices. 500 MB dariam ~400 mil lançamentos.
3. **O R2 é gratuito** (10 GB, 1M operações de escrita e 10M de leitura por mês,
   egress zero), mas exige cartão cadastrado na Cloudflare. **Decisão do dono:
   nenhum driver de storage nesta fase** — nem R2, nem disco local. O export baixa
   no navegador, a restauração sobe por upload, e o aceite da fase fecha assim.

### Decisões tomadas (Fase 9) — confirmadas com o dono

1. **Sem storage.** Nada de arquivo gravado no servidor. O único lugar onde o
   backup enviado repousa é `RestoreJob.content`, enquanto o job roda — e é
   apagado ao terminar, no sucesso e na falha.
2. **Mesclar categoria migra tudo e os limites de orçamento SOMAM.** Se as duas
   tinham orçamento no mesmo mês, R$ 300 + R$ 200 vira R$ 500.
3. **Zona de risco em dois níveis.** "Apagar lançamentos" zera movimentação,
   fatura, importação e carteira, mas mantém conta, cartão, categoria, tag e a
   configuração (orçamento, meta, recorrência, regra) — dá para recomeçar sem
   reconfigurar tudo. "Excluir conta" apaga o domínio inteiro e o usuário. Cada
   um exige uma **frase diferente** digitada por escrito.
4. **Notificações são preferência + aviso no app.** Não há e-mail nem push: os
   avisos são derivados sob demanda dos dados que já existem (fatura vencendo,
   orçamento estourado, meta atingida, previsto a confirmar).

### O que foi feito (backend)

- **Schema**: preferências de aviso no `User` (`notifyInvoiceDue`,
  `notifyBudgetExceeded`, `notifyGoalReached`, `notifyForecastDue`,
  `notifyDaysBefore`) e o model `RestoreJob` (status, modo, progresso, resultado
  por seção, erro, conteúdo temporário). Migrações `preferencias_de_aviso` e
  `restauracao_de_backup`.
- **`packages/shared/src/backup-logic.ts`**: formato do arquivo (`BACKUP_VERSION`,
  Zod), **ordem das 17 tabelas com pai antes de filho**, ordem inversa para
  apagar, o que cada nível da zona de risco remove, `sortByParent` (hierarquia de
  categoria) e `splitSelfReference` (vínculo do estorno gravado em 2º passe).
- **`packages/shared/src/notification-logic.ts`**: `buildNotifications` puro —
  fatura vencendo/vencida, orçamento em 80% e estourado, meta alcançada e
  previsto a confirmar, ordenados por gravidade e data, com id estável.
- **`apps/api/src/settings/`**: perfil e aparência, preferências de aviso,
  **sessões ativas** (com rótulo de dispositivo e marcação de "este aqui") e
  revogação individual ou de todas as outras. `GET /notifications` monta o sino.
- **`apps/api/src/categories/`**: `POST /categories/:id/mesclar` e
  `GET /categories/uso` (contagem por categoria, para saber o que dá para apagar).
- **`apps/api/src/backup/`**: `GET /backup/exportar.json` (tudo),
  `GET /backup/exportar.csv?section=…` (10 seções, `;` + BOM para o Excel),
  `POST /backup/restaurar` (valida e enfileira), `GET /backup/restaurar/:id`
  (progresso), `POST /backup/apagar-lancamentos` e `DELETE /backup/conta`.
- **`apps/api/src/backup/backup.processor.ts`**: a restauração roda em job do
  pg-boss, dentro de **uma transação só** (ou o banco fica igual ao arquivo, ou
  nada muda), em lotes de 500, com progresso gravado no `RestoreJob`.

### Detalhes técnicos que valem registro

- **Os tipos das colunas vêm do DMMF do Prisma**, não de uma lista escrita à mão
  ([apps/api/src/backup/model-fields.ts](apps/api/src/backup/model-fields.ts)). O
  JSON não carrega `BigInt` nem `Date`, então a restauração precisa saber o que
  converter de volta — e uma lista fixa ficaria desatualizada no dia em que
  alguém somasse um campo ao schema, com o sintoma sendo *valor errado no banco*,
  não erro de compilação. Coluna desconhecida é descartada; valor que não é
  inteiro em centavos é **recusado** em vez de virar float.
- **O backup não leva credencial**: nada de `User` (identidade), `Session`,
  `AuthAccount`, `TwoFactor` ou `Jwks`. Perfil e preferências viajam junto e são
  reaplicados na restauração; senha e 2FA, nunca.
- **O staging da importação fica de fora** (`ImportBatch`/`ImportRow`): é
  descartável e carrega o arquivo original em base64. Os lançamentos que saíram
  dele estão em `transaction`, que vai no backup.
- **Apagar lançamentos zera o saldo das contas** junto — saldo remanescente sem
  nenhum lançamento por trás seria um número sem história.
- **Mesclar categoria respeita as duas chaves únicas** que a migração poderia
  violar: `Budget(categoryId, month)` (limites somam) e
  `CategoryRule(pattern, categoryId)` (regra repetida vira uma, somando
  `appliedCount`). Mesclar numa subcategoria da própria origem é recusado, porque
  viraria ciclo na árvore.

### Verificado até aqui

- **CI local verde**: `pnpm lint` (4/4), `pnpm typecheck` (6/6), `pnpm test`
  (**318 testes**: shared 203, api 110, web 5) e `pnpm build` (4/4).
- **38 testes novos no shared**: ordem de FK das 17 tabelas provada par a par,
  recusa de backup de versão futura, seção desconhecida ignorada sem reprovar o
  arquivo, ausência de qualquer seção de credencial, `sortByParent` com entrada
  invertida/pai ausente/ciclo, e os quatro tipos de aviso com suas preferências.
- **32 testes novos na API**: mesclagem (soma de limites, unificação de regra,
  recusa de ciclo, tudo numa transação), zona de risco (frase exata, o que morre
  e o que sobrevive, saldo zerado, filho antes do pai) e restauração (ordem de
  gravação, categoria ordenada, vínculo do estorno em 2º passe, `replace` ×
  `merge`, `BigInt`/`Date` revividos, falha marcando `FAILED` e limpando o
  arquivo).

### O que foi feito (front, PWA e deploy)

- **Tela `/painel/configuracoes`** (uma seção por card, com régua de atalhos
  rolável em 380px): **perfil** (nome, e-mail, estado do 2FA e **troca de
  senha**), **aparência**, **avisos**, **categorias** (criar, editar, mesclar,
  apagar, com a contagem de uso de cada uma), **sessões ativas** (encerrar uma
  ou todas as outras), **backup** e **zona de risco**. Link novo no `AppNav`.
- **Aparência de verdade**: `data-theme` no `<html>` escrito por um script inline
  que roda **antes da primeira pintura** (sem piscar branco ao abrir no escuro),
  com o servidor como fonte da verdade — o tema escolhido no celular vale no
  computador. `apps/web/src/lib/theme.ts` concentra a lógica, testada.
- **Sino de avisos** no topo, consumindo `GET /notifications`, com contador,
  severidade por cor, valor e link para a tela que resolve o aviso. Recarrega ao
  trocar de tela, então pagar a fatura apaga o aviso dela.
- **Fontes da Seção 4**: Inter e Manrope entraram por `next/font` (parte do
  Next, sem dependência nova). A classe `font-manrope` era usada em 8 telas
  desde a Fase 2 e **não fazia nada** — o token não existia no `@theme`. Agora
  todo número grande sai em Manrope tabular, como o design pede.
- **PWA completo**: `manifest.webmanifest` (ícones, atalhos, cores do tema),
  ícones gerados por [design/gerar-icones-pwa.py](design/gerar-icones-pwa.py),
  service worker escrito à mão e página `/offline`.
- **Deploy**: `Dockerfile` por app, `docker-compose.prod.yml` (web/api/postgres
  em rede interna, só o web publica porta), `.dockerignore`, `.env.prod.example`
  e [README.md](README.md) com o passo a passo do Coolify.

### Decisões (front e deploy) — confirmadas com o dono

1. **Cor de acento só escreve `--primary`.** Hover, realce, foco e sombra saem
   por `color-mix` no CSS, e só quando existe acento personalizado — assim os
   hexadecimais exatos do CLAUDE.md continuam sendo o padrão, em vez de virarem
   aproximação calculada. A cor vale nos dois temas.
2. **O service worker não cacheia `/api/*`.** Saldo, fatura e orçamento vindos de
   resposta velha seriam pior que tela offline: o app mentiria com números que
   parecem certos. Só o casco (JS, CSS, ícone) e a página de offline são
   guardados; navegação é sempre rede, e sem rede cai no `/offline` — nunca numa
   tela autenticada antiga.
3. **Troca de senha na tela de configurações** (não estava na lista da Seção 7,
   mas está no design de Configurações): a recuperação por e-mail depende de um
   provedor de envio que o projeto não tem, então sem isto a única saída seria
   mexer no banco à mão.
4. **Sem `next-pwa`**: manifest e `sw.js` são 60 linhas escritas à mão. Ícone é
   asset gerado por script (PIL), não dependência.
5. **Migração roda no start da API** (`prisma migrate deploy`, idempotente), não
   num container à parte — o alvo é uma VPS com uma instância só.
6. **A imagem da API não faz prune de devDependencies**: o client gerado do
   Prisma e os symlinks do pnpm vivem no `node_modules` do builder, e
   reinstalar em modo produção apagaria o client sem ter mais a CLI para
   regerá-lo. Imagem maior, um passo a menos que quebra em produção.

### Três armadilhas que só apareceram rodando

1. **`next dev` quebrado com Next 15.5.22.** Qualquer client component que
   importa `@cifrao/shared` derrubava o servidor de desenvolvimento com
   *"Cannot use 'import.meta' outside a module"*: o pnpm resolve o pacote pelo
   caminho real (`packages/shared/dist`, fora de `node_modules`), o Next passa a
   tratá-lo como código do app e o loader do React Refresh injeta `import.meta`
   num arquivo CommonJS. Não era código novo — o trace apontava
   `painel/page.tsx`, da Fase 4; apareceu quando o `pnpm install` sincronizou o
   `node_modules` com a versão do lockfile. **`transpilePackages` não resolve** e
   `resolve.symlinks = false` quebra o recharts. A saída foi
   **`next dev --turbopack`** (bundler que já vem no Next, sem dependência
   nova); o build de produção segue no webpack, como sempre esteve.
2. **Prisma no container do web.** O `standalone` empacotava o client e deixava
   o **query engine** para trás: a imagem subia e quebrava no primeiro acesso ao
   banco. Corrigido com `serverExternalPackages` + `@prisma/client` declarado
   explicitamente em `apps/web` (já era dependência de fato, via `@cifrao/db` e
   o adapter do Better Auth — só não estava escrita).
3. **O rewrite `/api/*` é resolvido no build**, não em runtime: `API_INTERNAL_URL`
   definido só no compose não tinha efeito nenhum e o web tentava
   `localhost:3001` dentro do próprio container. Virou `ARG` do Dockerfile
   (`build.args` no compose). Mudou o endereço da API, reconstrói a imagem.

### Aceite verificado (Fase 9)

- **CI local**: `pnpm lint` (4/4), `pnpm typecheck` (6/6), `pnpm test`
  (**327 testes**: shared 203, api 110, web 14) e `pnpm build` (4/4) — verdes.
- **Aceite da fase — "exportar o histórico inteiro e restaurar num banco limpo"
  — provado por smoke E2E (59/59)** na API real, do jeito certo: os números de
  antes e de depois vêm dos mesmos endpoints que as telas usam, com o banco
  arrasado no meio.
  - export com **90 registros**, exatamente o que o resumo prometia; **nenhuma
    seção de credencial** no arquivo; centavo como string (BigInt);
  - zona de risco: frase errada **não apaga nada**; nível 1 apagou 25
    lançamentos, **zerou o saldo** e manteve contas, cartões e as 49 categorias;
  - restauração em job do pg-boss, `replace`, chegando a 100% e limpando o
    arquivo enviado;
  - **e então tudo volta idêntico**: saldo das contas (R$ 2.915,00), 25
    lançamentos de todos os tipos, despesa, receita, patrimônio, fatura do
    cartão, disponível de verdade, carteira, orçamento, saldo lido pela meta, os
    12 previstos da recorrência, o parcelamento em 6 faturas, o estorno de
    reembolso vinculado e até tema e preferência de aviso;
  - mesclagem: lançamento migrado, **limites do mesmo mês somados** (R$ 300 +
    R$ 200 = R$ 500), origem apagada;
  - avisos derivados sem gravar nada, e desligar a preferência apaga o aviso;
  - CSV com **BOM**, `;` e uma linha por lançamento.
- **Smoke de UI (16/16)** com o Next rodando: `/painel/configuracoes` responde
  200 com as sete seções, o sino aparece no topo, o script de tema entra antes
  da pintura, o manifest está no `<head>`, o Manrope carrega e `/offline` abre
  sem sessão. Conferido também no navegador em **390px**: tema e cor de acento
  aplicados na hora ao clicar, sino listando os avisos com valor.
- **Deploy provado de verdade**: `docker compose -f docker-compose.prod.yml up`
  numa stack isolada — as três imagens sobem **healthy**, a API aplica as 11
  migrações no start, o proxy `/api/*` alcança o Nest pela rede interna, o
  cadastro grava no Postgres do container e uma chamada autenticada
  (`/api/settings`) volta 200 com o JWT validado via JWKS entre containers.

---

## Pós-fases — revisão tela a tela contra o design

Depois das 10 fases, o dono passou a revisar o app **uma tela por vez** contra os
protótipos em [design/](design/). Não é fase nova: é acerto de fidelidade e de
uso, com o mesmo rito (teste para o que é regra, commit pequeno, parar).

### Navegação — sidebar lateral

As 14 seções viviam numa régua horizontal que só cabia rolando, escondendo
metade do app. Viraram [app-shell.tsx](apps/web/src/components/app-shell.tsx):
sidebar fixa de 264px a partir de `lg`, gaveta com overlay abaixo disso (fecha no
Escape, na navegação e trava a rolagem do fundo), agrupada em Dia a dia / Onde
está o dinheiro / Planejamento / Dados, com Configurações e Sair no rodapé.
`isActiveNavLink` ([nav.ts](apps/web/src/lib/nav.ts)) está testado porque
`/painel` casaria com todas as rotas filhas por prefixo.

### Transferência que não saía — e o erro que mentia

Bug relatado: "avisa data inválida". Não era a data. Em
[transaction-dialog.tsx](apps/web/src/app/painel/lancamentos/transaction-dialog.tsx)
o destino era inicializado com `accounts[1]`; com uma conta só, o estado nascia
vazio enquanto o `<select>` **exibia** a primeira conta — ia `toAccountId: ""` no
POST. E o cliente jogava fora as `issues` do Zod, então todo 400 virava "Dados
inválidos", sem dizer o campo.

Duas correções: os selects passaram a ter placeholder explícito e `required` (o
destino não oferece a conta de origem, que o schema recusa de qualquer jeito), e
[api-error.ts](apps/web/src/lib/api-error.ts) traduz as issues para
`"Conta de destino: obrigatório"`. **Lição que vale para o resto do app: select
controlado sem `<option value="">` mente para o usuário** — mostra a primeira
opção e envia vazio.

### Tela de Contas — fiel ao [design/Cifrao Contas.dc.html](design/Cifrao%20Contas.dc.html)

O protótipo tem **três estados** e existia só um (grade de dois cards com botões
de editar/ajustar em cima). Agora:

- **Lista** ([contas/page.tsx](apps/web/src/app/painel/contas/page.tsx)) — título
  em Manrope, pílula "Transferir", cartão de patrimônio em degradê com o valor
  quebrado em três tamanhos, linhas de conta em coluna única (quadrado colorido
  com a inicial, tipo com marcador, saldo e chevron) e "Nova conta" tracejado.
- **Detalhe** ([contas/[id]/page.tsx](apps/web/src/app/painel/contas/%5Bid%5D/page.tsx))
  — cabeçalho com marca e ações, saldo grande, variação do período e o gráfico de
  6 meses que finalmente consome o `GET /accounts/:id/balance-evolution` escrito
  na Fase 2 e nunca usado; abaixo, o extrato agrupado por dia com chips de
  período, tipo, categoria e busca.
- **Transferência** ([contas/transferir/page.tsx](apps/web/src/app/painel/contas/transferir/page.tsx))
  — cartão de valor, De/Para com o botão de trocar entre eles e o aviso da regra
  5.7. Os cartões De/Para são o visual do design com um `<select>` nativo
  invisível por cima: no celular abre o seletor do sistema.

Decisões deste acerto:

1. **Degradê e sombras saem de `var(--primary)` por `color-mix`**, não do
   `#820AD1` fixo do protótipo — senão a cor de acento da Fase 9 deixava de
   valer justo na tela mais colorida.
2. **A tela de transferência ganhou Data e Descrição**, que o design não previu:
   `createTransferSchema` exige as duas. Ficaram num cartão discreto, com hoje e
   "Transferência" já preenchidos.
3. **`DialogContent` ganhou `sheet` e `hideClose`** (opcionais, ninguém mais
   mudou): o modal de ajuste de saldo é bottom sheet no celular, como no design.
4. **Rótulo de dia e de mês são escritos à mão**
   ([dates.ts](apps/web/src/lib/dates.ts)) porque `formatInSaoPaulo` não recebe
   locale — sairia "Fri" em vez de "Sex". O filtro de período converte horário de
   parede de São Paulo para UTC, com teste: pedir "junho" tem que trazer o
   lançamento do dia 30 às 22h, que em UTC já é 1º de julho (é a armadilha #4).
5. **O extrato usa `accountDeltaCents` do `shared`**, o mesmo que o serviço usa
   para manter saldo — assim transferência aparece com o sinal certo dos dois
   lados, sem regra duplicada no front.

Testes do acerto: `accounts.test.ts` (marca da conta, cor do saldo, prévia do
ajuste da regra 5.8), `dates.test.ts` (fuso do período, rótulos) e
`api-error.test.ts` — o web foi de 14 para **43 testes**.

### Tela de Cartões — fiel ao [design/Cifrao Cartoes.dc.html](design/Cifrao%20Cartoes.dc.html)

O protótipo tem lista, detalhe com duas abas, formulário em tela cheia e o modal
de pagamento. Existia uma grade de cards de texto e um detalhe com faturas em
acordeão. Agora:

- **Lista** ([cartoes/page.tsx](apps/web/src/app/painel/cartoes/page.tsx)) — o
  "plástico" em degradê da cor do cartão, empilhado, com fatura atual e limite
  disponível no rodapé de cada um; o cabeçalho soma a fatura aberta de todos.
- **Detalhe** ([cartoes/[id]/page.tsx](apps/web/src/app/painel/cartoes/%5Bid%5D/page.tsx))
  — plástico + cartão de limite lado a lado, com a **barra empilhada da regra
  5.5** (fatura aberta sólida, parcelas futuras hachuradas, o resto é o
  disponível de verdade). Abas Fatura / Parcelas futuras; régua de faturas com
  setas; cabeçalho da fatura com estado, valor, fechamento, vencimento e o botão
  de pagar; extrato por dia onde a parcela **abre o cronograma inteiro**.
- **Formulário** ([cartoes/card-form.tsx](apps/web/src/app/painel/cartoes/card-form.tsx))
  — tela cheia (`/novo` e `/[id]/editar`), com prévia ao vivo do plástico,
  steppers de dia e o exemplo dinâmico de fechamento.
- **Pagar fatura** ([pay-dialog.tsx](apps/web/src/app/painel/cartoes/%5Bid%5D/pay-dialog.tsx))
  — sheet no celular, com o aviso da regra 5.6 ("é transferência, não despesa"),
  escolha da conta e Total/Parcial.

Decisões deste acerto:

1. **Endpoint novo: `GET /purchases/:id`**
   ([purchases.service.ts](apps/api/src/credit-cards/purchases.service.ts)). O
   design mostra a parcela "3/6" abrindo as seis, com a fatura de cada uma e a
   marca "esta fatura". Isso não dava para derivar no front: a partir de uma
   parcela não se recupera o total sem ambiguidade de centavos, porque
   `splitInstallments` distribui o resto. Testado com Prisma falso (3 testes).
2. **A barra do limite tem um terceiro pedaço que o design não previu**: fatura
   fechada e ainda não quitada. Só aparece quando é maior que zero — esconder
   isso seria esconder dívida.
3. **"Nova compra" ficou ao lado das abas.** O protótipo não tem esse botão em
   lugar nenhum do detalhe, mas é daqui que se lança compra no cartão.
4. **`···· 3921` usa a monoespaçada do sistema.** O design pede JetBrains Mono;
   a Seção 4 fixa Inter e Manrope, e fonte nova é dependência nova (Seção 2).
5. **O stepper de dia dá a volta em 28**, não em 31: dia 29 a 31 não existe em
   todo mês e a fatura escorregaria — o `clampDay` do `card-logic` já trata, mas
   é melhor não deixar escolher.

Testes: `cards.test.ts` cobre o degradê, a barra da regra 5.5 (inclusive estouro
de limite e cartão sem limite, que dividiria por zero) e o estado da fatura;
`purchases.service.test.ts` cobre o cronograma da regra 5.4. Web em **53
testes**, api em **113**.

### Tela de Lançamentos — fiel ao [design/Cifrao Lancamentos.dc.html](design/Cifrao%20Lancamentos.dc.html)

Esta foi a maior: o formulário do protótipo pedia **quatro coisas que não
existiam no modelo de dados**. O dono decidiu construir as quatro.

**Backend novo (migração `20260806234004_forma_de_pagamento`):**

1. **`paymentMethod` no Transaction** (`PIX`, `DEBIT`, `CREDIT`, `CASH`,
   `BOLETO`, opcional). Os chips do design agora guardam de verdade, e o filtro
   da lista aceita a forma. **`CREDIT` é recusado em `POST /transactions`**: a
   compra no crédito passa por fatura e parcelamento (5.3 e 5.4), então entra por
   `POST /credit-cards/:id/purchases`, que grava a forma sozinho.
2. **`GET /categories/sugestao`**
   ([category-suggestion.service.ts](apps/api/src/categories/category-suggestion.service.ts))
   — a etiqueta "sugerido" da grade. Primeiro tenta as `CategoryRule` da Fase 6
   (escolha explícita do usuário, confiança 1); sem regra, soma a semelhança das
   descrições do histórico por categoria. Cinco acertos medianos valem mais que
   um isolado.
3. **`PUT /transactions/:id/splits`**
   ([splits.service.ts](apps/api/src/transactions/splits.service.ts)) — o
   `TransactionSplit` existia no Prisma desde a Fase 0 e nenhuma API o usava. A
   soma das partes tem que fechar **exatamente** com o valor; a categoria única
   passa a ser a da maior parte, para as telas que ainda não leem divisão.
   Transferência não se divide (5.7).
4. **Repetir** liga o formulário no `RecurringRule` da Fase 5.

**Front:** a lista virou grupos por dia com total, filtros em chips grudados no
topo, chips do que está filtrado (com × para desligar um a um), rodapé com total
filtrado e entradas/saídas, FAB no celular e a barra escura de seleção múltipla.
Previsto sai com a borda tracejada e opacidade do design, num grupo "Próximos"
no fim. O formulário virou sheet com valor grande, teclado numérico **só no
celular**, chips de data, forma de pagamento, bloco de crédito com a fatura de
destino e as parcelas, e grade de categorias com a sugerida em primeiro.

Decisões deste acerto:

1. **Os totais do rodapé usam `sumIncomeCents`/`sumExpenseCents` do `shared`** —
   as mesmas funções dos relatórios. Assim os números batem entre as telas por
   construção: transferência fora (5.7), estorno abatendo o gasto (5.13),
   previsto fora do realizado.
2. **Despesa não é vermelha na lista**, é tinta normal, como no protótipo. Lista
   toda vermelha não destaca nada; o vermelho fica para o que exige ação.
3. **Teclado numérico só abaixo de `sm`** (decisão do dono): no desktop o campo
   aceita digitação direta, com o mesmo visual.
4. **Editar não troca conta nem tipo** — isso é excluir e lançar de novo, e o
   formulário diz isso. Trocar a conta de um lançamento salvo exigiria desfazer
   e refazer saldo nas duas pontas.
5. **`vitest.config.ts` do web ganhou o alias `@/`**: sem ele, um helper que
   importa outro por `@/` quebrava só no teste.

Testes: `transactions.test.ts` (12) cobre o agrupamento por dia com fuso, o
rótulo Hoje/Ontem, os previstos em grupo próprio e os totais do rodapé com as
regras 5.7 e 5.13; `splits.service.test.ts` (9) cobre a soma que tem que fechar,
inclusive o centavo a mais e a menos; `category-suggestion.service.test.ts` (5)
cobre a precedência regra > histórico. **Web 65 testes, api 127.**

Depois, os filtros foram reestruturados a pedido do dono: sete chips numa régua
rolante escondiam metade deles — o mesmo problema que a sidebar resolveu no
menu. Ficou **período + botão "Filtros" (com o número do que está ligado) +
busca ocupando o resto da linha**. O resto mora num painel que aplica na hora e
mostra o resultado no rodapé antes de fechar; tipo, situação, tag e forma viraram
pílulas, conta e categoria seguem em select (aguentam lista longa). Os chips
abaixo passaram a listar só o que o botão esconde.

### Primeiros passos e retrospectiva — as duas telas que faltavam

Estavam em [design/Cifrao Complementares.dc.html](design/Cifrao%20Complementares.dc.html)
mas **nenhuma fase do CLAUDE.md as pediu**, então nunca foram construídas. O dono
percebeu ao criar a conta pela primeira vez.

Migração `20260807003010_primeiros_passos_e_retrospectiva`: `onboardingDoneAt` e
`lastReviewSeenMonth` no `User`.

- **`/bem-vindo`** ([bem-vindo/page.tsx](apps/web/src/app/bem-vindo/page.tsx)) —
  quatro passos: primeira conta (com os bancos comuns já listados), cartão com
  prévia ao vivo, trazer lançamentos e as categorias. Fica **fora do `/painel`**:
  sem sidebar nem cabeçalho, porque quem chega aqui ainda não tem o que navegar.
- **`/painel/revisao`** ([revisao/page.tsx](apps/web/src/app/painel/revisao/page.tsx))
  — retrospectiva em slides de tela cheia, uma cor por capítulo: entrou, para
  onde foi, onde mais gastou e se o orçamento segurou.
- **`GET /reports/revisao`**
  ([month-review.service.ts](apps/api/src/reports/month-review.service.ts)) —
  compõe `netIncomeCents` e `netExpenseByCategory`, os mesmos agregados dos
  relatórios e do orçamento. Assim "estourou" na retrospectiva e "estourou" no
  orçamento dizem a mesma coisa.

Decisões deste acerto (confirmadas com o dono):

1. **O onboarding desvia, mas deixa pular** (`OnboardingGate` no layout do
   painel). E **só desvia quem não tem nenhuma conta cadastrada** — quem
   restaurou um backup tem dados mas nunca viu os primeiros passos, e seria
   absurdo jogá-lo lá.
2. **A retrospectiva avisa nos 7 primeiros dias do mês** e depois some; a rota
   fica sempre acessível (com `?mes=`), e agora também no menu. O mês visto é
   guardado no servidor, então o aviso não reaparece em outro dispositivo.
3. **"Conectar Open Finance" do protótipo virou "Importar extrato"**: sincronizar
   banco é integração externa que este app não tem. Ficaram as duas portas que
   existem de verdade — importar (Fase 6) e lançar na mão.
4. **Slide sem dado não entra.** Mês sem orçamento não mostra o slide de
   orçamento; mês sem nada mostra uma tela explicando, não quatro slides
   zerados.
5. **Gasto sem categoria aparece no "onde mais gastou"**, com esse nome. Escondê-lo
   daria um slide que não fecha com o total de saídas do slide anterior.

Testes: `onboarding.service.test.ts` (9) cobre o desvio, o caso do backup
restaurado e a janela do aviso — inclusive a virada de dia em São Paulo e a
retrospectiva de dezembro pedida em janeiro. **Api 136 testes.**

### Painel — fiel ao [design/Cifrao Dashboard.dc.html](design/Cifrao%20Dashboard.dc.html), com modo privacidade

O painel tinha os dados certos numa estrutura que não era a desenhada. Agora
segue o protótipo: saudação com **navegador de mês** (‹ agosto ›), saldo de hoje
em tamanhos escalonados com o "disponível de verdade" destacado dentro dele, a
**régua do mês**, três cartões de estatística com faísca, faixa de pendentes, e
o corpo em duas colunas (faturas, rosca de categorias, orçamento e últimos
lançamentos à esquerda; patrimônio e insight à direita).

- **Régua do mês** ([month-ruler.tsx](apps/web/src/app/painel/month-ruler.tsx))
  — a peça de assinatura: o que já passou fica abaixo da linha em cinza, o que
  vem fica acima e colorido, e o marcador de HOJE separa os dois. A haste é
  proporcional ao valor, então o que pesa mais salta aos olhos.
- **Modo privacidade** ([privacy.tsx](apps/web/src/lib/privacy.tsx)) — o olho no
  cabeçalho troca todo valor por `••••`.

Decisões deste acerto:

1. **A privacidade fica no `localStorage`, não no servidor.** É decisão do
   momento e do aparelho — esconder valores no ônibus não deveria esconder no
   computador de casa. Por isso não entrou no `User` como as outras
   preferências da Fase 9.
2. **O sinal de negativo sobrevive ao mascaramento** (`-R$ ••••`). Esconder
   quanto é uma coisa; esconder que está no vermelho é outra.
3. **Dois campos novos no `/dashboard`**: `monthlyTrend` (6 meses, para a
   variação e a faísca dos cartões) e `pendingCount`. A tendência sai de **uma
   consulta cobrindo a janela inteira**, não uma por mês (armadilha #5), e
   respeita a regra 5.13 — estorno abate o gasto em vez de virar receita.
4. **A rosca de categorias é SVG à mão, não Recharts.** São seis fatias com
   clique; o gráfico completo custaria mais peso do que entrega. Recharts
   continua nos gráficos de verdade (evolução, comprometimento, relatórios).
5. **"Conectar Open Finance" e a barra de progresso animada do protótipo ficaram
   de fora** — a primeira não existe no app, a segunda é enfeite.

Testes: `privacy.test.ts` (5) cobre o mascaramento, inclusive a preservação do
`R$` e do sinal negativo. **Web 70 testes.**

---

## Retomando o trabalho em outra sessão

Estado atual: **as 10 fases (0 a 9) estão concluídas.** O app está inteiro:
contas, cartões com fatura, parcelamento, dashboard, recorrências, orçamento,
metas, importação, relatórios, investimentos, configurações, backup, PWA e os
arquivos de deploy. O passo a passo de subir em produção está no
[README.md](README.md).

O que ficou de fora, de propósito, e caberia num próximo trabalho:

- **Job semanal de dump para o R2** (Seção 9 do CLAUDE.md): virou melhoria
  futura quando o dono decidiu fechar a fase **sem storage**. Hoje o backup é
  manual (export pela tela ou `pg_dump`).
- **Anexo de comprovante** (`Attachment` da Seção 6) — depende do mesmo storage.
- **Entrega de e-mail** (recuperação de senha) — sem provedor no stack; a troca
  de senha pela tela de configurações cobre o caso do dia a dia.
- **Desfazer uma importação confirmada** e **editar a compra pai propagando para
  as parcelas futuras** (trecho final de 5.4).

```bash
docker compose up -d db                    # Postgres em dev (host 55432)
pnpm install && pnpm build
pnpm --filter @cifrao/db exec prisma migrate deploy
pnpm dev                                   # web 3000 + api 3001
```

Antes de continuar, o que um novo chat precisa saber:

1. **Leia o `CLAUDE.md` inteiro** — a Seção 5 são requisitos, não sugestões, e a
   Seção 10 define o ritual (3 linhas antes de começar, uma fase por vez, teste
   obrigatório por regra, parar no fim).
2. **Storage está fora por decisão do dono.** Não crie driver de disco nem de
   R2 sem falar com ele: o backup é export/import por download e upload.
3. **Qualquer soma de despesa usa `netExpenseByCategory`/`netIncomeCents`**
   ([apps/api/src/common/expense-aggregates.ts](apps/api/src/common/expense-aggregates.ts))
   em vez de `groupBy` cru — senão o abatimento de reembolso (5.13) se perde.
4. **Dinheiro é `bigint` em centavos e data é UTC** (5.1 e 5.2). Cuidado com
   filtro de data vindo da URL: `z.coerce.date()` em `"2026-03-31"` dá meia-noite
   UTC, que em São Paulo ainda é dia 30 — foi bug real na Fase 7.
5. **Agregação é no banco** (armadilha #5), nunca `reduce` no Node sobre milhares
   de linhas.
6. **`pg-boss` e `ofx-js` são ESM** e a API é CommonJS no Node 20: para outra lib
   ESM, use `importEsm` de [apps/api/src/common/esm.ts](apps/api/src/common/esm.ts).
7. **Dependência nova, serviço externo ou abstração fora do CLAUDE.md:
   perguntar antes** (Seção 2). Vale para qualquer lib de PWA/service worker — o
   manifest e o `sw.js` estão escritos à mão, sem `next-pwa`.
8. **O `next dev` roda com Turbopack** (`--turbopack` no script do web) porque o
   webpack de desenvolvimento quebra com pacote CommonJS do workspace em client
   component — detalhe na armadilha 1 da Fase 9. O **build continua no webpack**.
9. **Mexeu em `next.config.ts`? Teste o `next dev` E o `next build`.** Foi ali
   que moraram três bugs da Fase 9 (rewrite resolvido no build, Prisma sem
   engine no standalone, `outputFileTracingRoot` derrubando o dev no Windows).
   E **nunca rode `pnpm build` do web com o `next dev` no ar**: os dois disputam
   a mesma pasta `.next` e o servidor de desenvolvimento passa a servir erro.

```bash
pnpm install
docker compose up -d db      # Postgres em dev (host:55432 -> container:5432)
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local   # defina BETTER_AUTH_SECRET
cp apps/api/.env.example apps/api/.env
pnpm --filter @cifrao/db exec prisma migrate deploy   # aplica as migrações
pnpm --filter @cifrao/db seed        # categorias padrão (seed:demo p/ ~5k lançamentos)
pnpm test                    # testes (shared + api + web)
pnpm dev                     # sobe banco + api (3001) + web (3000)
```

> Observação de ambiente: nesta máquina as portas **3000/3100** (Next) e
> **5432/5433** (Postgres) já estavam ocupadas por outros serviços. O
> `docker-compose` publica o Postgres em **55432**; se a **3000** estiver ocupada
> ao rodar `pnpm dev`, libere-a ou ajuste a porta do web.

---

## Abertura para múltiplos usuários — em andamento (branch `dev`)

> Trabalho iniciado em 30/09/2026, quando o dono decidiu **tornar o app
> público**. Está na branch `dev`, saída da `main`, e **não está terminado**:
> falta a bateria de teste cruzado antes de abrir o registro. Leia a seção
> "O que falta" no fim.

### Por que isso virou um projeto, e não uma linha

Abrir o registro é uma linha em `apps/web/src/lib/registration.ts`. O problema é
que **o app não tinha isolamento por usuário**: `userId` existia só nos três
models de autenticação (`Session`, `AuthAccount`, `TwoFactor`) e **nenhum dos 20
models de domínio tinha dono**. Os services não filtravam por usuário em nenhuma
das ~131 chamadas ao Prisma.

Isso era coerente com a Seção 1 do CLAUDE.md ("uso individual, não é SaaS"), mas
significa que abrir o registro sem mais nada faria todo usuário novo ver, editar
e apagar o dado financeiro de todos — e a zona de risco apagaria o banco inteiro
de todo mundo.

### Etapa 1 — `userId` no schema + migração (commit `e60b6cf`)

`userId` em 15 models, `Cascade` a partir de `User`, índices de `Transaction`
liderados por `userId`.

**Cinco colisões que quebrariam no SEGUNDO usuário**, não numa tela distante:

| O que era | Por que quebraria |
|---|---|
| `Tag.name @unique` global | ninguém mais poderia ter a tag "viagem" |
| `Investment.ticker @unique` global | ninguém mais poderia ter PETR4 |
| `Budget(categoryId, month)` | dois usuários orçando a mesma categoria no mesmo mês |
| `CategoryRule(pattern, categoryId)` | mesma regra para dois usuários |
| `AllocationTarget` com `class` como **PK** | uma linha de alvo no banco inteiro |

A migração é **escrita à mão** (coluna `NOT NULL` em tabela populada exige
backfill): nullable → backfill → `NOT NULL` → índices → FK. Tem uma **trava que
aborta** se houver dado de domínio com um número de usuários diferente de 1 —
chutar o dono de lançamento financeiro é pior que falhar.

Validada em três bancos descartáveis antes do dev: cópia do dump, a trava com 2
usuários (erro claro e rollback limpo em transação) e banco vazio migrando do
zero. Soma dos saldos idêntica antes e depois.

### Categorias universais — decisão do dono

`Category.userId` é **NULLABLE**: `NULL` = categoria universal, compartilhada por
todos. O dono recusou duplicar as 48 padrão por usuário ("evitar centenas de
repetições"), então o seed continua global e um usuário novo já entra com a
árvore inteira.

Consequências:

1. Categoria universal é **somente-leitura** — apagar uma derrubaria orçamento e
   regra de todos, via `onDelete: Cascade`.
2. **Mesclar tem direção**: a própria PARA uma universal é permitido (é o caso
   útil); o contrário, não.
3. `GET /categories/uso` conta só os lançamentos do requisitante — o total
   vazaria o quanto os outros usam.
4. Renomear ou recolorir uma categoria padrão **deixou de ser possível**. A
   alternativa (copy-on-write: editar uma global forka uma cópia sua) ficou
   como refinamento futuro.

### Etapa 2 — escopo nas queries (commit `5da8d84`)

Cada service recebe o `userId` do `@CurrentUser()`; toda query carrega o dono.
Escopo **explícito e grepável** em vez de Prisma Client Extension: a mágica não
cobriria as 3 queries cruas e o código do projeto é explícito em todo lugar.

**O compilador só apontou as 70 escritas. As 61 LEITURAS compilavam perfeitas e
devolviam o dado de todos** — era ali o vazamento: `dashboard` fazia
`invoice.findMany({})` **sem `where` nenhum**, e os "8 lançamentos recentes"
vinham do banco inteiro. Mesma história em `calendar`, `reports`,
`notifications` e `receivables`.

E seis escritas atravessavam o dono:

- `transactions.bulk` — os ids vêm do corpo da requisição: bastava passar o id de
  outra pessoa para recategorizar ou **apagar** o lançamento dela;
- `ensureAccounts` — dava para lançar na conta de outro usuário;
- `investments.setTargets` — `deleteMany({})` limpava o alvo de todos;
- `backup.wipeMovements` e `deleteAccount` — `deleteMany({})` apagava o **banco
  inteiro, de todos**, na zona de risco de um só;
- `backup.processor` — `user.updateMany` sem `where` reescrevia o perfil de todos;
- `POST /recurring-rules/generate` rodava a geração nas regras de todos.

Decisões:

1. **`findFirst({ id, userId })` no lugar de `findUnique({ id })`**: id que existe
   mas é de outro dono responde 404, em vez de entregar o registro.
2. **Cron e jobs derivam o dono da PRÓPRIA entidade** (regra, lote, job), não de
   um JWT — é o que deixa o cron rodar para todos e o job de importação seguir
   com uma linha só no payload.
3. **Na restauração, o `userId` de toda linha é reescrito para quem restaurou**:
   um arquivo não pode gravar dado no nome de outro. Efeito assumido: categoria
   universal do arquivo vira cópia pessoal de quem restaurou.
4. Os quatro models sem `userId` próprio (`transactionSplit`, `transactionTag`,
   `investmentTransaction`, `priceHistory`) filtram pela relação com o pai.

Varredura das 131 chamadas ao Prisma: sobraram 23 sem `userId` literal, todas
conferidas uma a uma — recebem o `where` já escopado por parâmetro
(`liquidDeltaSum`, `topTransactions`, `netExpenseByCategory`) ou derivam o dono
da entidade.

### Rate limit em login, cadastro e 2FA (commit `13d06db`)

O limitador embutido do Better Auth não protegia nada com o padrão dele: **100
requisições por 10 segundos** (600 tentativas de senha por minuto) e **desligado
em desenvolvimento**.

| Rota | Limite |
|---|---|
| `/sign-in/email` | 10 por 5 min |
| `/sign-up/email` | 5 por hora |
| `/two-factor/verify-totp` · `verify-otp` · `verify-backup-code` | 5 por 5 min |

O 2FA entrou junto do que foi pedido: quem chega ali já acertou a senha e são 6
dígitos — limitar o login e deixar essa rota aberta seria trancar a porta e
esquecer a janela. O padrão global segue folgado (é por onde passa o
`get-session`), e o balde é por rota.

**Armadilha do IP atrás de proxy — leia antes de subir.** O Better Auth resolve o
cliente pelo `X-Forwarded-For` e, sem `trustedProxies`, só aceita o cabeçalho com
UMA entrada; quando não resolve, **todos caem num balde compartilhado**. Atrás do
Coolify, um `X-Forwarded-For` falsificado faz o proxy repassar dois saltos, o IP
fica irresolvível e o limite passa a valer para o conjunto — **negação de serviço
contra os próprios usuários**. Por isso `TRUSTED_PROXIES` entra no
`docker-compose.prod.yml` com a faixa da rede Docker. **Confira a faixa do seu
proxy ao subir.**

Storage em **memória**: reiniciar zera os contadores. Basta para a instância
única do alvo; com réplica, precisaria de `storage: 'database'` e model novo.

Verificado contra o servidor no ar: login 401×10 e **429 na 11ª**; cadastro para
na 6ª; 2FA na 6ª; `get-session` segue 200 com as outras duas travadas; 429 responde
com `x-retry-after`.

### Verificado

- **CI**: lint 4/4, typecheck, `pnpm test` (**347**: shared 203, api 110, web 34)
  e build 4/4 — verdes.
- A API sobe com os 3 workers do pg-boss e os endpoints devolvem 401 sem token.
- Banco de dev migrado: 48 categorias universais, 21 pessoais (lixo de smoke
  test), 1.205 lançamentos com dono, zero órfão.

### Merge da `main` na `dev` (07/10/2026)

Os 6 commits de 06/08 (seção "Pós-fases" acima) só chegaram ao GitHub em
06/10, direto na `main`. Até ali, `main` e `dev` saíam do mesmo ponto
(`b3b66a4`) sem se conhecer. O merge teve **um conflito só** (dashboard), mas o
risco de verdade não aparecia como conflito: **os serviços novos de agosto
nasceram sem dono** e compilavam perfeitamente em cima do schema com `userId`.

| Serviço (rota) | O que vazava |
|---|---|
| `SplitsService` (`GET/PUT /transactions/:id/splits`) | lia **e reescrevia** a divisão do lançamento de qualquer um pelo id; aceitava categoria pessoal alheia |
| `CategorySuggestionService` (`GET /categories/sugestao`) | sugeria a partir das regras e do histórico de **todos** — vazava descrição alheia indiretamente |
| `PurchasesService` (`GET /purchases/:id`) | cronograma de parcelas de qualquer compra pelo id |
| `MonthReviewService` (`GET /reports/revisao`) | retrospectiva somava entradas, saídas e orçamento do **banco inteiro** |
| `OnboardingService` | contava contas do banco inteiro: o 2º usuário **nunca veria as boas-vindas** |
| `DashboardService` (o que a main somou) | contagem de pendentes e tendência de 6 meses do banco inteiro |

Mesmo padrão da Etapa 2: `@CurrentUser()` no controller, `findFirst({ id, userId })`
no lugar de `findUnique`, categoria aceita só se for do usuário ou universal.

**Migrações**: as duas de agosto têm data anterior à `isolamento_por_usuario`.
Conferido nos dois cenários: banco limpo (a ordem de produção) aplica as 14 e
fica idêntico ao `schema.prisma`; o banco de dev aplicou as duas pendentes por
cima da de setembro, também sem drift. Nenhuma das duas cria model novo — só
`Transaction.paymentMethod` e dois campos em `User` —, então nada precisou de
`userId`.

Verificado: lint, typecheck, build e `pnpm test` (**435**: shared 203, api 142,
web 90). Os testes dos serviços novos ganharam Prisma falso que filtra por dono
e um caso "outro usuário" cada; a retrospectiva ganhou teste que exige `userId`
no `where` de **toda** consulta. **Não houve smoke na API real com dois
usuários** — isso é o item 1 abaixo, e agora precisa cobrir também essas rotas.

### O que falta — NÃO abra o registro antes disto

1. **Bateria de teste cruzado (usuário A × usuário B)**, endpoint por endpoint,
   provando que A não lê nem modifica dado de B. É ela a rede de segurança real:
   o compilador não acusa leitura sem escopo, e a varredura de queries é
   heurística.
2. **Verificação de e-mail no cadastro** — sem ela, qualquer um se cadastra com o
   e-mail de outra pessoa. Depende do **Resend** (provedor já decidido, ver
   abaixo) com **domínio verificado**: o remetente de teste `onboarding@resend.dev`
   só entrega para o endereço da própria conta e deixa de servir com registro
   aberto.
3. **Abrir o registro** (`apps/web/src/lib/registration.ts`).

Pendências conhecidas que este trabalho criou ou deixou em aberto:

- Renomear/recolorir categoria padrão deixou de existir (ver copy-on-write acima).
- O export de backup inclui as categorias universais para as referências
  resolverem; na restauração elas viram cópias pessoais de quem restaurou.
- LGPD: guardar dado financeiro de terceiros é uma postura legal diferente de
  manter o próprio caderno. Levantado com o dono, sem decisão ainda.

### Decisão de e-mail (ainda não implementada)

Provedor escolhido: **Resend**. Motivos específicos deste projeto: a API é um
`POST` para `api.resend.com/emails`, que dá para fazer com `fetch` puro e **não
adiciona dependência** (SMTP obrigaria `nodemailer`); free permanente sem cartão
(3.000/mês, 100/dia). O único uso hoje seria a recuperação de senha, cujo
callback `sendResetPassword` em `apps/web/src/lib/auth.ts` ainda só escreve o
link no `console.log`.
