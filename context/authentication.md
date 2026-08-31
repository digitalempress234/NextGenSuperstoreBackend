# Authentication, OTP and Password Recovery

## Cookie-only authentication
Access and refresh tokens are stored only in Secure, HttpOnly cookies. Frontend code must not store authentication tokens in localStorage, sessionStorage, IndexedDB, or JavaScript-readable cookies.

## OTP purposes
- EMAIL_VERIFICATION
- PASSWORD_RESET

## OTP lifecycle
1. Generate a cryptographically random 6-digit code.
2. Store only a SHA-256 hash using `OTP_PEPPER`.
3. Expire after the configured TTL.
4. Limit failed attempts.
5. Enforce resend cooldown through Redis.
6. Consume the challenge after successful verification.
7. Invalidate older unconsumed challenges when a new OTP is created.

## Endpoints
- `POST /purse/v1/auth/register`
- `POST /purse/v1/auth/verify-email`
- `POST /purse/v1/auth/resend-email-otp`
- `POST /purse/v1/auth/login`
- `POST /purse/v1/auth/verify-`
- `POST /purse/v1/auth/forgot-password`
- `POST /purse/v1/auth/reset-password`
- `POST /purse/v1/auth/refresh`
- `POST /purse/v1/auth/logout`

## Forgot password flow
`forgot-password` intentionally returns the same accepted response whether the email exists to prevent account enumeration. If the account exists, a reset OTP is emailed. The reset endpoint accepts email + OTP + new password. Successful reset revokes active sessions.

## Email verification
Registration creates an unverified account and sends an OTP. The user cannot complete normal login until email verification succeeds.

### OTP lifecycle
- Supported purposes: `EMAIL_VERIFICATION` and `PASSWORD_RESET`.
- A user has at most one active challenge per purpose.
- Resend deletes the existing challenge and creates a replacement.
- OTP values are never stored in plaintext.
- Successful verification deletes the challenge row immediately.
- Failed verification increments attempts; max attempts invalidates the challenge.
- Login is password-based and does not use OTP.
