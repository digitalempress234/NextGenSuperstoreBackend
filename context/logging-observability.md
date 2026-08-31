# Logging & Observability

## What is logged

The backend produces structured JSON logs for:

- HTTP request start/completion/failure
- request ID and latency
- authentication success/failure
- authorization failures
- OTP creation/replacement/verification failures
- password reset events
- Google authentication events
- rider onboarding and KYC reviews
- catalog/store changes
- cart and checkout failures
- payment initialization, webhook receipt, verification and failure
- order state changes
- delivery assignment and state changes
- GPS/delivery tracking failures
- delivery-code issue/verification failures
- notification creation and delivery failures
- email send/retry/failure
- Cloudinary upload failures
- Redis/cache/queue errors
- Prisma/database errors
- unexpected exceptions
- privileged administrative actions

## Log fields

Typical events include:

```json
{
  "level": 30,
  "time": 1777000000000,
  "service": "purse-api",
  "environment": "production",
  "requestId": "b42b6e4e-2e3c-4e7e-9f44-4bd5a4c8b1f6",
  "userId": 123,
  "eventType": "business",
  "event": "order.payment.confirmed",
  "orderId": 981,
  "durationMs": 114
}
```

## Request tracing

Every request receives an `x-request-id` header. If the caller already supplies one, it is reused.

The same request ID is available to application services through `RequestContextService`.

## Error tracking

Unhandled exceptions are captured by `AllExceptionsFilter`. The API returns the request ID so support engineers can search logs using that ID.

## Sensitive data

The logger redacts:
- cookies;
- authorization headers;
- passwords;
- access/refresh tokens;
- OTPs;
- secrets;
- account numbers;
- BVN/NIN;
- document numbers;
- delivery-code hashes;
- provider credentials.

Do not add sensitive values to custom log payloads.

## Production format

Production logs are newline-delimited JSON so they can be ingested by:
- Docker logging;
- CloudWatch;
- Loki/Grafana;
- ELK/OpenSearch;
- Datadog;
- another log collector.

Development uses `pino-pretty`.

## Useful Docker commands

```bash
docker logs -f purse-api
docker logs --since=10m purse-api
docker logs --since=10m purse-api 2>&1 | grep '"level":50'
```

For production, prefer a centralized log platform rather than treating Docker's local log file as permanent storage.

## Recommended alert events

Create alerts for:
- repeated 5xx responses;
- Prisma/database errors;
- failed payment webhooks;
- payment reconciliation mismatches;
- delivery-code verification lockouts;
- authentication failure spikes;
- OTP abuse/rate-limit spikes;
- queue backlogs;
- email delivery failures;
- Cloudinary failures;
- Redis connection failures.

## Log severity

- `trace`: very detailed diagnostic information.
- `debug`: developer diagnostics such as optional Prisma query timing.
- `info`: normal application and business lifecycle events.
- `warn`: recoverable failures, security events and abnormal conditions.
- `error`: failed requests, integrations, database errors and unexpected exceptions.
- `fatal`: process-level failures where applicable.

## Event naming

Use dot-separated event names:

```text
auth.login.success
auth.login.failed
auth.otp.created
auth.otp.invalid
auth.otp.verified
auth.password.reset
auth.google.signin
rbac.access.denied
user.created
store.created
product.updated
cart.checkout.failed
payment.initialized
payment.webhook.received
payment.verification.failed
order.created
order.status.changed
delivery.assigned
delivery.location.updated
delivery.code.issued
delivery.code.invalid
delivery.code.verified
notification.created
notification.email.sent
notification.email.failed
rider.kyc.submitted
rider.kyc.approved
rider.kyc.rejected
```

## Request correlation

Every request carries `x-request-id`.

Example:

```text
requestId=5b2b2f5a-8d2d-49f9-90d1-2db9f3de2b9c
```

Support can search the exact request ID across application logs, payment logs and delivery logs.

## What should never be logged

Never log:
- passwords;
- OTP values;
- access/refresh cookies;
- OAuth ID tokens;
- API secrets;
- BVN/NIN;
- full bank account numbers;
- KYC document contents;
- delivery codes;
- raw Paystack signatures.

The redaction configuration is deliberately aggressive. Add new sensitive fields to `LOG_REDACT_PATHS` when new integrations are introduced.


## OTP logging

OTP creation events are logged with the actual OTP code when `LOG_OTP_CODES=true`.

Example:

```json
{
  "eventType": "otp",
  "event": "auth.otp.created",
  "purpose": "email_verification",
  "code": "482193",
  "requestId": "..."
}
```

This is intentional for operational support. Do not expose application logs to end users.
