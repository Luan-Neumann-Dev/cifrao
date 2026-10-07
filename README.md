# Cifrão

App web de finanças pessoais: contas, cartões com fatura de verdade,
parcelamento, orçamento, metas, importação de extrato, relatórios e carteira de
investimentos. Feito para uso pessoal — o cadastro fecha depois da primeira
conta.

**[Ver a demonstração](#demonstração)** — roda no navegador, sem cadastro, com
dados de exemplo. Para usar de verdade, veja
[Rodando a versão completa](#rodando-a-versão-completa).

O que ele faz e por quê está em [CLAUDE.md](CLAUDE.md) (requisitos) e em
[PROGRESS.md](PROGRESS.md) (o que foi construído, fase a fase, com as decisões).

## Stack

pnpm workspaces + Turborepo · Next 15 (App Router) · NestJS 11 · Prisma ·
PostgreSQL · Zod compartilhado · Better Auth com 2FA TOTP · Tailwind v4 +
shadcn/ui · Recharts · pg-boss (fila no próprio Postgres) · Vitest.

```
apps/web      Next 15 — telas e autenticação
apps/api      NestJS  — REST, jobs e regras de domínio
packages/db   Prisma  — schema, migrações e seeds
packages/shared  Zod, tipos e a lógica pura (dinheiro, datas, faturas, relatórios)
```

## Demonstração

A demo é **o mesmo código**, num build com `NEXT_PUBLIC_DEMO=true`: sem backend,
sem banco e sem login. As respostas da API foram gravadas de uma instância de
verdade (`apps/web/scripts/record-demo.mjs` monta um cenário pela própria API e
grava o que as telas pedem), então faturas, parcelas e saldos são os que as
regras calcularam — nada é inventado na tela. O relógio fica congelado no dia da
gravação, para os dados nunca "envelhecerem"; ações que gravariam mostram um
aviso. Tudo isso mora em `apps/web/src/demo/` — as telas não sabem que a demo
existe — e o build normal não leva nada de lá.

Publicar na Vercel (plano gratuito): importe o repositório e configure

| Campo | Valor |
|---|---|
| Root Directory | `apps/web` |
| Build Command | `cd ../.. && pnpm turbo run build --filter=@cifrao/web` |
| Environment Variable | `NEXT_PUBLIC_DEMO` = `true` |

Regravar os dados (mesmo cenário, data nova): suba web e API num banco
**descartável e vazio** e rode `node apps/web/scripts/record-demo.mjs`.

## Rodando a versão completa

Requisitos: Node 22+, pnpm 10+, Docker (só para o Postgres).

```bash
pnpm install
docker compose up -d db                        # Postgres em dev na porta 55432

cp packages/db/.env.example packages/db/.env
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local   # defina BETTER_AUTH_SECRET

pnpm build
pnpm --filter @cifrao/db exec prisma migrate deploy
pnpm --filter @cifrao/db seed                  # categorias padrão

pnpm dev                                       # web :3000 · api :3001
```

Verificação: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`. Com web e
API no ar num banco descartável, `pnpm --filter @cifrao/api test:e2e` roda a
bateria de isolamento entre usuários.

> Nesta máquina as portas 3000/3100 e 5432/5433 já estavam ocupadas; por isso o
> Postgres de desenvolvimento é publicado em **55432**.

O primeiro cadastro cria o usuário e **fecha o registro**. Para reabrir (só se
precisar recriar a conta), ligue `REGISTRATION_OPEN=true` no web.

## Deploy (VPS única com Coolify)

Três containers numa rede interna: `web`, `api` e `postgres`. Só o `web` publica
porta — é nele que o proxy do Coolify encosta. O front fala com a API pelo
rewrite interno `/api/*`, então não existe CORS aberto.

### 1. Variáveis

```bash
cp .env.prod.example .env       # e preencha
openssl rand -base64 32         # vale como BETTER_AUTH_SECRET
```

| Variável | Para que serve |
|---|---|
| `POSTGRES_PASSWORD` | senha do Postgres do container |
| `BETTER_AUTH_SECRET` | assinatura das sessões e do JWT |
| `BETTER_AUTH_URL` | URL pública (`https://…`) — entra em cookie e link |
| `REGISTRATION_OPEN` | `true` só no primeiro acesso; depois `false` |
| `WEB_PORT` | porta publicada do web (padrão 3000) |

### 2. Subir

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

O container da API roda `prisma migrate deploy` no start (é idempotente) e só
então sobe o Nest. O `web` espera o healthcheck da API.

No Coolify: aponte o projeto para este repositório, escolha
**Docker Compose** com o arquivo `docker-compose.prod.yml`, cadastre as
variáveis acima na aba de environment e deixe o proxy apontar para o serviço
`web` na porta 3000. O HTTPS é o do próprio Coolify.

### 3. Depois do primeiro deploy

1. Acesse a URL, crie a conta (o registro fecha sozinho depois dela).
2. Ative o 2FA em **Configurações → Perfil** e guarde os códigos de recuperação.
3. Instale como app: o navegador oferece "instalar" (PWA com manifest, ícones e
   casco offline).
4. Exporte um backup em **Configurações → Backup** e guarde fora da VPS. É o
   plano de recuperação: o mesmo arquivo restaura num banco limpo.

### Backup do banco

O dump automático semanal para o R2 previsto na Seção 9 do CLAUDE.md **não foi
implementado** — por decisão minha, a Fase 9 saiu sem driver de storage. O que
cobre o mesmo problema hoje:

```bash
docker compose -f docker-compose.prod.yml exec db \
  pg_dump -U cifrao cifrao > cifrao-$(date +%F).sql
```

…ou o export em JSON pela tela de configurações, que restaura pelo próprio app.

## Regras que não são negociáveis

Estão na Seção 5 do [CLAUDE.md](CLAUDE.md) e cada uma tem teste automatizado.
As três que mais mudam o desenho do código:

- **dinheiro é inteiro em centavos** (`BigInt`), nunca float;
- **fatura de cartão é entidade própria**, e pagar fatura é transferência, não
  despesa nova;
- **transferência não entra em receita nem em despesa** em relatório nenhum.

## Licença

[MIT](LICENSE) — pode copiar, adaptar e usar.
