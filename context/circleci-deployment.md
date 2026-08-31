# CircleCI Docker Deployment

## Deployment flow

```text
Push to main
    |
    v
CircleCI test
    |-- install dependencies
    |-- Prisma validate
    |-- format check
    |-- lint
    |-- build
    |-- unit tests
    |
    v
Build Docker image
    |-- tag = CIRCLE_SHA1
    |-- push to registry
    |
    v
SSH to production host
    |-- upload docker-compose.production.yml
    |-- upload deploy-production.sh
    |-- docker login
    |-- docker pull immutable image
    |-- prisma migrate deploy
    |-- docker compose up -d
    |-- health check /purse/health
    |
    v
Production
```

## CircleCI context

Create a CircleCI context named `purse-production` with:

```text
REGISTRY_HOST
REGISTRY_USERNAME
REGISTRY_PASSWORD
IMAGE_NAME
DEPLOY_HOST
DEPLOY_USER
DEPLOY_PORT
DEPLOY_PATH
```

Example:

```text
REGISTRY_HOST=ghcr.io
IMAGE_NAME=your-org/purse-backend
DEPLOY_HOST=api-host.example.com
DEPLOY_USER=ubuntu
DEPLOY_PORT=22
DEPLOY_PATH=/opt/purse
```

Add the production SSH private key to CircleCI Project Settings → SSH Keys. Do not put that private key into project environment variables or Git.

## Production host prerequisites

The target host needs:

- Docker Engine
- Docker Compose v2 (`docker compose`)
- `curl`
- an SSH account allowed to manage the Docker service
- `${DEPLOY_PATH}/.env`
- network connectivity to MySQL and Redis

The production compose file only runs the API container. MySQL and Redis can be managed services or separately managed containers.

## Production application `.env`

The server-side `.env` remains the source of application secrets. CircleCI must not generate it.

At minimum, it contains the database, Redis, Paystack, Cloudinary, SMTP, JWT, OTP, Google and cookie configuration documented in `.env.example`.

## Image strategy

CircleCI pushes an immutable image:

```text
REGISTRY_HOST/IMAGE_NAME:CIRCLE_SHA1
```

Deployment uses the commit SHA, not the mutable `production` tag. This makes rollback deterministic.

## Database migrations

Before starting the new API container, the deployment script runs:

```bash
npx prisma migrate deploy
```

using the exact image being deployed.

The runtime container does **not** automatically run migrations on every application startup. This keeps application startup separate from schema migration execution.

## Rollback

Because images are immutable, rollback is performed by selecting a previous known-good commit SHA and redeploying it.

Example:

```bash
export PURSE_IMAGE=ghcr.io/your-org/purse-backend:<known-good-sha>
docker compose -f docker-compose.production.yml up -d --no-build
```

A database migration is not automatically rolled back. Only use application rollbacks when the database schema remains compatible, or have an explicit backward migration procedure.

## Package-lock note

The supplied source tree currently does not contain a `package-lock.json`, and generating one could not be completed in this environment. CircleCI therefore uses `npm install` rather than `npm ci` so the pipeline is runnable from the current repository.

For stricter dependency reproducibility, generate and commit `package-lock.json` from the development repository, then change the CircleCI install step to:

```bash
npm ci
```

and change the cache key to use the lockfile checksum.

## Security rules

Never store the following in Git:

- registry passwords
- SSH private keys
- database passwords
- Paystack secrets
- SMTP passwords
- Cloudinary API secrets
- JWT secrets
- OTP pepper
- Google private credentials

The deployment script receives the registry password over SSH stdin solely for `docker login` and does not place it into the application's `.env` or command-line arguments.
