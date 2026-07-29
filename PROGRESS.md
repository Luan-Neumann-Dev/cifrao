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

### Como rodar

```bash
pnpm install
docker compose up -d db      # sobe o Postgres
pnpm test                    # roda os testes (shared + api)
pnpm dev                     # sobe banco + api (3001) + web (3000)
```
