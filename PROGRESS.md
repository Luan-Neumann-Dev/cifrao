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

## Como rodar

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
