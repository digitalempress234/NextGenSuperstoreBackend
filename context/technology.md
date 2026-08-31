# Technology

## 1. Selected Stack

| Technology | Purpose |
|---|---|
| NestJS | Modular TypeScript backend framework |
| Prisma | ORM and database access |
| MySQL | Primary transactional database |
| Redis | Cache, rate limiting and background coordination |
| Cloudinary | Media and document storage |
| Nodemailer | SMTP email delivery |
| Paystack | Payment initialization, verification and webhooks |
| Node.js | Runtime |

The selected NestJS + Prisma architecture is appropriate for a modular REST API, while Prisma supports MySQL as a database provider.

## 2. Environment

Production:
```env
NODE_ENV=production
BASE_URL=https://api.syroltech.com/purse
```

Recommended additional configuration:

```env
PORT=3000
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/DATABASE
REDIS_URL=redis://HOST:6379

JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=

PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=

CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
MAIL_FROM=

CORS_ORIGIN=
LOG_LEVEL=info
```

Secrets must be injected by the deployment environment and must not be committed.

## 3. Prisma
Use Prisma as the only default relational data-access layer. Use migrations for schema evolution.

Recommended commands:

```bash
npx prisma generate
npx prisma migrate dev --name <name>
npx prisma migrate deploy
npx prisma studio
```

Development migration commands and production deployment commands must remain separate.

## 4. Redis
Recommended uses:
- cache-aside reads for catalog/store pages;
- rate limiting;
- queues for email and notifications;
- short-lived OTP/verification values.

Cache invalidation should happen on relevant writes, e.g. product/store price/stock changes invalidate affected catalog and comparison keys.

## 5. Cloudinary
Store only references/metadata in MySQL:
- public ID;
- resource type;
- document type;
- owner;
- review status;
- timestamps.

Use separate upload handling for public product images and restricted KYC material.

## 6. Nodemailer
Nodemailer is an infrastructure adapter, not the source of business logic.

Recommended flow:

```text
Domain event
  -> queue job
  -> email worker/service
  -> Nodemailer transport
  -> retry on transient failure
```

Templates should be centralized and versioned.

## 7. Paystack
Payment integration responsibilities:
- initialize transaction;
- redirect/authorization URL handling;
- webhook ingestion;
- signature/authenticity verification;
- server-side verification where required;
- idempotent transaction processing;
- reconciliation.

The database transaction reference is unique.

## 8. API Documentation
Use Swagger/OpenAPI in NestJS:
- bearer authentication;
- DTO schemas;
- error responses;
- webhook endpoint documentation where appropriate.

Recommended:
```text
GET /purse/docs
GET /purse/docs-json
```

Protect internal/admin-only documentation in production if required.

## 9. Deployment
Recommended production process:

```text
Git push
  -> CI
  -> lint
  -> tests
  -> build
  -> Prisma migrate deploy
  -> deploy application
  -> health check
```

Do not run destructive database operations automatically without approval.

## 10. Testing
- Unit tests: services/state machines.
- Integration tests: Prisma/MySQL repositories.
- E2E tests: auth, checkout, payment webhook and delivery flows.
- Contract tests: Paystack and other external adapters where practical.

Critical scenarios:
1. Duplicate payment webhook.
2. Payment succeeds but notification fails.
3. Two customers compete for limited stock.
4. Rider assignment race.
5. Expired/invalid pickup code.
6. Unauthorized store staff access.
7. Rejected KYC document and resubmission.


## 11. Authentication Storage Policy
Authentication is cookie-only for browser clients. Access and refresh JWTs are stored in `Secure`, `HttpOnly` cookies and are never returned in JSON. The frontend must not persist authentication material in `localStorage`, `sessionStorage`, IndexedDB, or JavaScript-readable cookies.

For unsafe HTTP methods, the API validates the browser Origin/Referer against `CORS_ORIGIN` to provide CSRF protection for cookie-authenticated requests. Production must run over HTTPS.
