#!/usr/bin/env sh
set -eu

npm install --no-audit --no-fund
npx prisma validate
npm run prisma:generate
npm run format:check
npm run lint
npm test
npm run build
