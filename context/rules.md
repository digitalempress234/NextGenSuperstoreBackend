# Engineering and Business Rules

## 1. General Engineering Rules
1. TypeScript strict mode.
2. No `any` unless justified and isolated.
3. Controllers must stay thin.
4. Business logic belongs in services/use-cases.
5. Prisma access must not be scattered through unrelated controllers.
6. Every public DTO is validated.
7. API-breaking changes require versioning or an explicit migration plan.
8. Secrets never enter source control or logs.
9. External API calls require timeout and error handling.
10. Background jobs must be idempotent.

## 2. Security Rules
- Passwords are hashed using an approved password hashing library.
- Short-lived access tokens and refresh-token rotation are recommended.
- Sensitive KYC URLs are not exposed by default.
- Authorization is permission-based, not only role-name checks.
- Rate-limit authentication and webhook endpoints appropriately.
- Validate webhook authenticity before processing.
- Log privileged actions in audit logs.
- Do not log passwords, tokens, NIN/BVN values, account numbers or full KYC documents.

## 3. RBAC Rules
- A user may have multiple roles.
- Roles may have multiple permissions.
- Permission naming should follow `resource.action`, e.g. `orders.read`, `orders.update`.
- Backend authorization is mandatory even when the frontend hides actions.
- Store-scoped permissions must also verify store membership.

## 4. Catalog Rules
- Product is the canonical product identity.
- StoreProduct is the store-specific offer.
- Price and stock belong to StoreProduct.
- Product matching by barcode should be preferred when available.
- Duplicate canonical products should be merged or administratively resolved.
- A cart item references a specific StoreProduct, not only Product.

## 5. Cart and Checkout Rules
- Prices are recalculated server-side.
- Client totals are never authoritative.
- Order item stores a price/product snapshot.
- Checkout creates immutable order snapshots.
- Stock is validated at checkout.
- Payment callback processing must be idempotent.
- A single customer checkout may create multiple store orders.

## 6. Order Rules
- Order transitions are controlled by an explicit state machine.
- Invalid status jumps are rejected.
- Cancellation/refund rules depend on current state and policy.
- Order history is append-only where possible.

## 7. Pickup Rules
- Pickup code is generated securely and expires where appropriate.
- Codes must not be predictable.
- Verification attempts may be rate-limited.
- Successful verification records actor, timestamp and verification method.

## 8. Delivery Rules
- Only approved/active riders can receive assignments.
- A rider cannot accept conflicting deliveries if policy prevents it.
- Delivery status changes are recorded historically.
- Delivery completion may require code, OTP, signature or proof according to policy.

## 9. Rider/KYC Rules
- Document requirements are configurable.
- Each document has a review status.
- Rejection requires a reason visible to the appropriate reviewer/user.
- Expiring licences, insurance and roadworthiness records require expiry tracking.
- Bank account verification must be confirmed before payout eligibility.
- Raw sensitive identifiers should be minimized, protected and access-controlled.

## 10. Money Rules
- Use Decimal database fields for monetary values.
- Never use floating-point arithmetic for money.
- Store currency explicitly; default is NGN.
- Payment and wallet mutations must be transactional.
- Prefer append-only ledger/transaction records over directly changing balances without history.

## 11. Data and Migration Rules
- All schema changes use reviewed Prisma migrations.
- Production migrations are applied through deployment procedures, not ad-hoc schema pushes.
- Destructive migrations require backup and rollback planning.
- Add indexes for foreign keys and common filters.


## 12. Browser Authentication Storage
- Never return access or refresh JWTs in JSON.
- Use Secure + HttpOnly cookies for browser authentication.
- Never store authentication data in localStorage/sessionStorage/IndexedDB.
- Never use JavaScript-readable auth cookies.
- Never enable wildcard credentialed CORS.
- Production cookie authentication requires HTTPS.
- Unsafe browser requests must pass the configured Origin/Referer CSRF check.


Webhook exception: provider-to-provider webhooks do not carry browser Origin headers. They bypass browser CSRF origin checks only after provider signature/authentication succeeds.

## 12. OTP Rules
- OTP is used only for email verification and password recovery.
- Login OTP is not required or supported.
- OTPs are exactly 6 numeric digits.
- Only the OTP hash is stored in MySQL; plaintext OTPs are never persisted.
- There must be at most one active OTP challenge per user and purpose.
- Resending an OTP deletes the previous challenge before creating the replacement challenge.
- Successful OTP verification deletes the challenge record immediately.
- Expired challenges are rejected and may be cleaned up by a scheduled job.
- Failed attempts increment the challenge counter; exceeding the maximum invalidates the challenge.
- Redis enforces resend cooldowns.
