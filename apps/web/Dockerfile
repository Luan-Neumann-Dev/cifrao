# Imagem do web (Next 15). O contexto do build é a RAIZ do repositório:
#   docker build -f apps/web/Dockerfile .

FROM node:22-alpine AS builder
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile

# `NEXT_OUTPUT=standalone` liga o empacotamento enxuto (ver next.config.ts).
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone

# O destino do rewrite /api/* é resolvido no BUILD (vai para o routes-manifest),
# não em runtime: definir a variável só no compose não teria efeito nenhum e o
# proxy tentaria localhost:3001 dentro do container do web. Mudou o endereço da
# API? Precisa reconstruir a imagem.
ARG API_INTERNAL_URL=http://api:3001
ENV API_INTERNAL_URL=$API_INTERNAL_URL
# Valores só de build: o Better Auth instancia o Prisma ao importar o módulo, e
# o Prisma exige a variável presente mesmo sem conectar. Nada aqui vai para a
# imagem final — em runtime valem as variáveis do compose.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV DIRECT_URL="postgresql://build:build@127.0.0.1:5432/build"
ENV BETTER_AUTH_SECRET="build-only-secret"

RUN pnpm --filter @cifrao/shared build \
  && pnpm --filter @cifrao/db build \
  && pnpm --filter @cifrao/web build

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
ENV TZ=UTC
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1

# O standalone traz o server.js e só as dependências rastreadas; estático e
# público entram à parte porque o tracing não os inclui.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/server.js"]
