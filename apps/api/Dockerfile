# Imagem da API (NestJS). Build do monorepo inteiro: o Nest depende de
# @cifrao/shared e @cifrao/db, que são pacotes do workspace.
#
# O contexto do build é a RAIZ do repositório, não apps/api:
#   docker build -f apps/api/Dockerfile .

FROM node:22-alpine AS builder
# openssl: o engine do Prisma precisa dele no Alpine (musl).
RUN corepack enable && apk add --no-cache openssl
WORKDIR /app

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @cifrao/shared build \
  && pnpm --filter @cifrao/db build \
  && pnpm --filter @cifrao/api build

FROM node:22-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app
ENV NODE_ENV=production
# Persistência é sempre UTC (regra 5.2); a conversão para São Paulo é do código.
ENV TZ=UTC
ENV API_PORT=3001

# Sem prune de devDependencies: o client gerado do Prisma e os symlinks do pnpm
# moram no node_modules do builder, e reinstalar em modo produção apagaria o
# client sem ter mais a CLI para regerá-lo. Imagem um pouco maior, um passo a
# menos que pode quebrar em produção.
COPY --from=builder /app ./
COPY apps/api/docker-entrypoint.sh /usr/local/bin/cifrao-api
RUN chmod +x /usr/local/bin/cifrao-api

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["cifrao-api"]
