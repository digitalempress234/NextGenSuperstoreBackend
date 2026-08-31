# Build Status — V8 candidate

## Included
- Legacy signup validation and phone normalization.
- Shared User identity across customer/vendor/rider roles.
- Google sign-in/sign-up through Google Identity Services ID-token verification.
- OTP email verification and password reset remain unchanged: login OTP is not used; successful OTP verification deletes the OTP record; resend replaces the active OTP.
- Rider onboarding requirements endpoint with explicit document descriptions.
- `canSubmit` backend contract for disabling the rider submit button until requirements are met.
- Paystack bank listing and automatic account-number resolution.
- Searchable Nigerian state/city endpoints for rider forms.
- Exact rider review copy: `Your Account is Under Review`.

## External verification still required
Run with your real environment:

```bash
npm ci
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run check
```

Then test:
- Google client ID and real Google Identity Services credential.
- Paystack account resolution with a live/test key.
- SMTP delivery.
- MySQL migration against a backup of the existing database.
- Redis connectivity.
- Cloudinary document uploads.

The package is production-oriented source code, but the assistant environment cannot certify deployment against your infrastructure or credentials.


## Delivery tracking + endpoint test expansion
- Added persisted `DeliveryLocation` records and migration `20260826090000_add_delivery_tracking`.
- Added authenticated Socket.IO `/delivery` namespace and delivery rooms.
- Added REST current-location/history fallback and rider GPS ingestion.
- Added delivery status/location broadcast events.
- Added complete endpoint inventory/test coverage matrix and delivery tracking unit tests.
- Full dependency installation could not complete in this environment because `npm install --ignore-scripts --no-audit --no-fund --prefer-offline` exceeded the execution timeout.


OTP logging is enabled by default via `LOG_OTP_CODES=true`; set it to false to redact OTP values from logs.
