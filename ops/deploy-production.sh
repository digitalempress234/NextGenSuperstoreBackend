#!/usr/bin/env sh
set -eu

: "${PURSE_IMAGE:?PURSE_IMAGE is required}"
: "${REGISTRY_HOST:?REGISTRY_HOST is required}"
: "${REGISTRY_USERNAME:?REGISTRY_USERNAME is required}"
: "${DEPLOY_PATH:?DEPLOY_PATH is required}"

read -r REGISTRY_PASSWORD

mkdir -p "$DEPLOY_PATH"
cd "$DEPLOY_PATH"

echo "$REGISTRY_PASSWORD" | docker login "$REGISTRY_HOST" --username "$REGISTRY_USERNAME" --password-stdin

docker pull "$PURSE_IMAGE"

test -f .env || {
  echo "Missing $DEPLOY_PATH/.env"
  exit 1
}

printf '%s\n' "Deploying $PURSE_IMAGE"

docker run --rm \
  --env-file .env \
  "$PURSE_IMAGE" \
  npx prisma migrate deploy

export PURSE_IMAGE

docker compose -f docker-compose.production.yml up -d --no-build --remove-orphans

ATTEMPTS=30
until curl -fsS "http://127.0.0.1:${APP_PORT:-8084}/purse/health" >/dev/null 2>&1; do
  ATTEMPTS=$((ATTEMPTS - 1))
  if [ "$ATTEMPTS" -le 0 ]; then
    docker compose -f docker-compose.production.yml logs --tail=200 api
    exit 1
  fi
  sleep 2
done

docker image prune -af --filter "until=168h" >/dev/null 2>&1 || true

echo "Purse deployment is healthy."
