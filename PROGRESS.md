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

## Retomando o trabalho em outra sessão

Estado atual: **Fases 0 a 6 concluídas e commitadas.** A próxima é a **Fase 7 — Relatórios**.

```bash
docker compose up -d db                    # Postgres em dev (host 55432)
pnpm install && pnpm build
pnpm --filter @cifrao/db exec prisma migrate deploy
pnpm dev                                   # web 3000 + api 3001
```

Antes de começar a Fase 7, o que um novo chat precisa saber:

1. **Leia o `CLAUDE.md` inteiro** — a Seção 5 são requisitos, não sugestões, e a Seção 10 define o ritual (3 linhas antes de começar, uma fase por vez, teste obrigatório por regra, parar no fim).
2. **Relatórios têm que usar `netExpenseByCategory`/`netIncomeCents`** ([apps/api/src/common/expense-aggregates.ts](apps/api/src/common/expense-aggregates.ts)) em vez de `groupBy` cru — senão o abatimento de reembolso (5.13) se perde justamente onde mais importa. Esta é a pendência mais fácil de esquecer.
3. **Transferência e ajuste ficam fora de receita/despesa** (5.7) e **estorno de reembolso não é receita** (5.13): o aceite da Fase 7 é "os números batem exatamente com a soma dos lançamentos filtrados", então os dois têm que estar certos.
4. **Dinheiro é `bigint` em centavos e data é UTC** (5.1 e 5.2) — formatação e fuso só na apresentação, via helpers de `packages/shared`.
5. **Agregação é no banco** (armadilha #5), nunca `reduce` no Node sobre milhares de linhas.
6. Exportação PDF da Fase 7 provavelmente pede dependência nova — **perguntar antes** (regra da Seção 2).


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

> Observação de ambiente: nesta máquina as portas **3000/3100** (Next) e **5432/5433** (Postgres) já estavam ocupadas por outros serviços. O `docker-compose` publica o Postgres em **55432**; se a **3000** estiver ocupada ao rodar `pnpm dev`, libere-a ou ajuste a porta do web.
