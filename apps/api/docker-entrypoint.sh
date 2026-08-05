#!/bin/sh
# Entrada do container da API: aplica as migrações e sobe o Nest.
#
# As migrações rodam aqui, e não num container à parte, porque o alvo é uma VPS
# com uma instância só (Seção 9). `migrate deploy` é idempotente: se não houver
# migração pendente, ele não faz nada.
set -e

echo "[cifrao-api] aplicando migrações do Prisma…"
packages/db/node_modules/.bin/prisma migrate deploy --schema packages/db/prisma/schema.prisma

echo "[cifrao-api] subindo a API…"
exec node apps/api/dist/main.js
