#!/bin/sh
set -eu

if [ "${RUN_PRISMA_MIGRATIONS_ON_START:-false}" = "true" ]; then
  npx prisma migrate deploy
fi

exec node dist/main.js
