# Purse Superstore Backend

Production-oriented NestJS API for the Purse multi-store marketplace.

## What this revision fixes

This revision is intentionally larger and more structured than the earlier prototype. It has real feature modules, DTOs, persistence models, permissions, role assignment, approval workflows, audit logging, and an API contract designed for frontend integration.

## Stack

- NestJS 11
- TypeScript 5.9+
- Prisma 6 + MySQL
- Redis / ioredis
- Cloudinary
- Nodemailer / SMTP
- Paystack
- JWT authentication
- Swagger / OpenAPI

## Production base URL

```text
https://api.syroltech.com/purse
```

Versioned API:

```text
https://api.syroltech.com/purse/v1
```

Swagger:

```text
https://api.syroltech.com/purse/docs
```

Swagger JSON:

```text
https://api.syroltech.com/purse/docs-json
```

## Domain modules

```text
src/
├── auth/              Authentication and sessions
├── users/             Customer/admin profile and access context
├── rbac/              Roles, permissions and temporary overrides
├── approvals/         Approval policies, requests and SoD controls
├── audit/              Audit infrastructure
├── admin/             Platform administration and KYC review
├── stores/            Merchant/store management
├── catalog/           Categories, products and store offers
├── cart/              Customer cart
├── checkout/          Multi-store checkout splitting
├── orders/            Order state machine
├── payments/          Paystack integration and webhook handling
├── riders/            Rider onboarding/KYC/vehicle/bank/guarantor
├── delivery/          Rider offers and delivery state machine
├── notifications/     In-app notifications
├── mail/              Nodemailer infrastructure
├── uploads/           Cloudinary media/document uploads
├── reviews/           Verified-purchase reviews
├── prisma/            Database client
├── redis/             Cache/queue infrastructure
└── health/            Health checks
```

## RBAC model

The supplied SS RBAC design is implemented as four layers:

1. Platform roles.
2. Granular permissions.
3. Scoped permissions/overrides.
4. Approval policies for sensitive actions.

Important examples:

```text
orders.refund.initiate
orders.refund.approve
payments.reverse
wallets.freeze
wallets.credit
merchants.approve
users.freeze
risk.blacklist.create
reports.export
roles.assign
```

Role examples include:

```text
SUPER_ADMIN
OPERATIONS_ADMIN
FINANCE_ADMIN
RISK_COMPLIANCE_ADMIN
MERCHANT_ADMIN
CUSTOMER_SUPPORT_ADMIN
CREDIT_BNPL_ADMIN
AUDIT_OBSERVER_ADMIN
REGIONAL_ADMIN
COMPLIANCE_LEAD
VENDOR
STORE_AGENT
RIDER
CUSTOMER
```

The application checks permissions in the backend; frontend route hiding is only a presentation concern.

## Frontend integration

The frontend should authenticate with:

```http
POST /purse/v1/auth/login
Content-Type: application/json

{
  "email": "customer@example.com",
  "password": "StrongPassword123!"
}
```

The server sets Secure, HttpOnly cookies. The frontend must use `credentials: include` (Fetch) or `withCredentials: true` (Axios). Tokens are not exposed to JavaScript.

Use `/purse/v1/users/me/access` to build frontend feature visibility from the effective roles and permissions returned by the server.

## Core customer flow

```text
register/login
    -> catalog/products
    -> compare store offers
    -> cart
    -> checkout
    -> payment initialize
    -> Paystack
    -> webhook
    -> orders
    -> pickup OR delivery
```

## Store flow

```text
merchant/vendor login
    -> create store
    -> create catalog product
    -> add StoreProduct offer
    -> set price and stock
    -> receive order
    -> update order status
    -> prepare pickup / delivery
```

## Rider flow

```text
register/login
    -> rider profile
    -> identity/KYC documents
    -> licence
    -> vehicle
    -> vehicle documents
    -> bank account
    -> guarantor
    -> submit for review
    -> admin/risk review
    -> APPROVED
    -> delivery offers
    -> accept
    -> pickup
    -> status updates
    -> delivered
```

## Running locally

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:migrate:dev -- --name init
npm run prisma:seed
npm run start:dev
```

## Production

Prisma migrations should be committed and deployed using:

```bash
npm run prisma:migrate:deploy
npm run prisma:generate
npm run build
npm run start:prod
```

Do not use `prisma db push` for production schema deployment.

## Environment

See `.env.example`. Required infrastructure includes MySQL, Redis, Cloudinary, Paystack and an SMTP server.

Never commit real secrets.

## Verification before production

```bash
npm run lint
npm run format:check
npm run build
npm run test
npm run test:e2e
npm run prisma:validate
```

Also verify, against real infrastructure:

- MySQL migrations.
- Redis connection.
- Paystack test transaction and duplicate webhook.
- Cloudinary upload and restricted KYC delivery.
- SMTP delivery and retry behavior.
- CORS and HTTPS reverse proxy.
- Secrets and backup/restore procedure.


## Authentication storage policy

This backend uses secure HttpOnly cookies only. JWT access/refresh tokens are never returned in API JSON and must never be stored in localStorage, sessionStorage, IndexedDB, or readable cookies. Production cookies require HTTPS. The frontend must use `credentials: include` or Axios `withCredentials: true`.


## Browser authentication policy
The API is intentionally cookie-only. Login/register/refresh set Secure, HttpOnly cookies. Tokens are never returned to frontend JavaScript and must never be placed in localStorage, sessionStorage, IndexedDB, or readable cookies. Use `credentials: include`/`withCredentials: true`.

Production requires `AUTH_COOKIE_SECURE=true` and HTTPS.

## Authentication requirements

Authentication is cookie-only. No bearer tokens are exposed to frontend JavaScript and no authentication token may be stored in localStorage, sessionStorage, or IndexedDB.

OTP is implemented only for email verification and password recovery. Login does not require OTP. OTPs are hashed, expire, have attempt limits, resend replaces the previous OTP, and successful verification deletes the OTP record. See `context/authentication.md`.

### Authentication endpoints

```text
POST /purse/v1/auth/register
POST /purse/v1/auth/verify-email
POST /purse/v1/auth/resend-email-otp
POST /purse/v1/auth/login
POST /purse/v1/auth/verify-
POST /purse/v1/auth/forgot-password
POST /purse/v1/auth/reset-password
POST /purse/v1/auth/refresh
POST /purse/v1/auth/logout
```

Authentication is cookie-only. OTPs are six digits, server-side hashed, time-limited, attempt-limited, and resend-rate-limited. Password reset revokes existing sessions.

## Legacy bug fixes and Google authentication

The backend includes fixes for the legacy signup/rider issues and Google sign-in/sign-up.
See `context/legacy-bug-resolution.md` and `context/google-auth.md`.

Google requires a Google Web Client ID in `GOOGLE_CLIENT_ID`. The frontend uses Google Identity Services to obtain an ID token and posts it to `POST /purse/v1/auth/google`; the API verifies the token and then issues only Secure/HttpOnly Purse cookies.


## CircleCI Docker deployment

The repository includes `.circleci/config.yml` and `docker-compose.production.yml`. Pushes to `main` run validation, build an immutable Docker image tagged with the commit SHA, push it to the configured registry, SSH to the production host, apply Prisma migrations, deploy the image, and verify `/purse/health`.

See `context/circleci-deployment.md` for CircleCI context variables, server prerequisites, deployment flow and rollback.

## CircleCI deployment

CircleCI is configured in `.circleci/config.yml` to test the application, build an immutable Docker image tagged with the Git commit SHA, push it to the configured registry, then SSH into the production server and deploy it using `docker-compose.production.yml` and `ops/deploy-production.sh`.

See `context/circleci-deployment.md` for required CircleCI context variables, SSH setup, production host prerequisites, migration strategy and rollback procedure.
\n\n## Real-Time Delivery Tracking\nThe API exposes Socket.IO on `/purse/delivery`. The connection authenticates from the Secure/HttpOnly `purse_access_token` cookie. Riders can publish `delivery:location`; authorized customers/riders can join `delivery:join` and receive `delivery.location.updated`. Delivery state transitions emit `delivery.status.updated`. HTTP endpoints provide current-position and history fallback.\n\n## Endpoint Test Coverage\nThe `test/endpoint-cases.ts` inventory lists every controller route. `test/endpoint-coverage.e2e-spec.ts` compares that inventory against the generated Swagger route set and executes the unauthenticated contract for every route when `RUN_FULL_E2E=true`. Critical tracking rules also have unit tests. Run:\n\n```bash\nRUN_FULL_E2E=true npm run test:e2e\n```\n

## Delivery verification
A delivery requires a customer-provided six-digit delivery code. The code is sent in-app and by email, stored only as a hash, expires, is attempt-limited, and is deleted after successful verification.

## Structured logging
The API uses request IDs, structured logs, error logging, Prisma error/query logging controls, and sensitive-field redaction. See `context/logging-observability.md`.
