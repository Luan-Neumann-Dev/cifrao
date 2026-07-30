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

## Como rodar

```bash
pnpm install
docker compose up -d db      # Postgres em dev (host:55432 -> container:5432)
cp packages/db/.env.example packages/db/.env
cp apps/web/.env.example apps/web/.env.local   # defina BETTER_AUTH_SECRET
pnpm --filter @cifrao/db exec prisma migrate deploy   # aplica as migrações
pnpm test                    # testes (shared + api + web)
pnpm dev                     # sobe banco + api (3001) + web (3000)
```

> Observação de ambiente: nesta máquina as portas **3000/3100** (Next) e **5432/5433** (Postgres) já estavam ocupadas por outros serviços. O `docker-compose` publica o Postgres em **55432**; se a **3000** estiver ocupada ao rodar `pnpm dev`, libere-a ou ajuste a porta do web.
