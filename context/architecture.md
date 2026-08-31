# Architecture

## 1. Architectural Style
Use a modular monolith in NestJS for the MVP. Modules have clear boundaries and communicate through services and domain events. Redis-backed queues/caching support asynchronous work without introducing microservice complexity.

## 2. High-Level Topology

```text
Clients
  |
  v
Reverse Proxy / TLS
  |
  v
NestJS API
  ├── Auth & RBAC
  ├── Users
  ├── Vendors / Stores
  ├── Catalog / Search / Comparison
  ├── Cart / Checkout
  ├── Orders / Pickup
  ├── Payments
  ├── Riders / KYC / Vehicles / Guarantors
  ├── Deliveries
  ├── Notifications / Mail
  └── Admin / Audit
        |
        +--> Prisma --> MySQL
        +--> Redis --> cache / queues / rate limiting
        +--> Cloudinary --> images and documents
        +--> Paystack --> payment API + webhooks
        +--> SMTP provider --> Nodemailer
```

## 3. Application Layers
Each module should generally contain:
- controller: HTTP contract only;
- DTOs: validation and transport shapes;
- service/use-case: business logic;
- repository/data access where abstraction adds value;
- guards/policies for authorization;
- events/jobs for asynchronous side effects.

Avoid controllers calling Prisma directly.

## 4. Recommended NestJS Modules

```text
src/
├── app.module.ts
├── common/
│   ├── config/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   ├── pagination/
│   └── utils/
├── prisma/
├── redis/
├── auth/
├── users/
├── rbac/
├── addresses/
├── vendors/
├── stores/
├── categories/
├── products/
├── store-products/
├── comparison/
├── cart/
├── checkout/
├── payments/
├── orders/
├── pickup/
├── riders/
├── vehicles/
├── guarantors/
├── deliveries/
├── wallets/
├── notifications/
├── mail/
├── uploads/
├── reviews/
├── chat/
└── audit/
```

## 5. Request Flow
1. Request reaches global middleware.
2. Correlation/request ID is attached.
3. Authentication guard resolves identity.
4. Authorization guard evaluates permission.
5. DTO validation runs.
6. Controller calls service.
7. Service performs transactional business operation.
8. Side effects are emitted to queue/event handling.
9. Response interceptor formats output.

## 6. Transaction Boundaries
Use database transactions for operations that must be atomic:
- checkout creation;
- order splitting;
- stock reservation/decrement;
- payment state transition;
- rider delivery assignment where exclusivity matters;
- wallet/ledger mutations.

Do not keep database transactions open while calling Paystack, Cloudinary, SMTP, or other remote services.

## 7. Payment Architecture
Paystack is authoritative for gateway transaction outcome.

Flow:
1. Create pending CheckoutPaymentGroup.
2. Initialize payment.
3. Customer completes provider flow.
4. Receive webhook.
5. Verify webhook/signature according to provider requirements.
6. Verify transaction server-side where required.
7. Use transaction reference/idempotency key.
8. Transition payment group and allocated orders atomically.
9. Emit payment-success notifications.

Never trust a client-side "payment successful" response by itself.

## 8. Redis Responsibilities
Use Redis for:
- cache-aside product/store reads;
- rate limiting;
- OTP/session-related short-lived values where appropriate;
- background queues;
- distributed coordination only where necessary.

Do not use Redis as the system of record for orders or payments.

## 9. File Architecture
Cloudinary stores:
- product images;
- store images;
- rider identity documents;
- vehicle documents;
- guarantor documents.

Database stores metadata, ownership, public/private URL strategy, Cloudinary public ID, document type, review state and timestamps.

Sensitive KYC documents should use restricted access/delivery policies rather than unrestricted public URLs.

## 10. Observability
- Structured JSON logs.
- Request/correlation IDs.
- Error monitoring integration.
- Health and readiness endpoints.
- Metrics for API latency, queue failures, payment webhooks and failed jobs.
- Audit records for privileged changes.


## 11. Browser Authentication
Authentication is session-based using signed JWTs carried only in Secure, HttpOnly cookies. The API never returns the JWT values to browser JavaScript. Access and refresh cookies use the `/purse` path. Unsafe browser requests are protected by Origin/Referer validation against the configured CORS allowlist.

No application code should use `localStorage` or `sessionStorage` for authentication, authorization, refresh tokens, or sensitive user data.
\n\n## Real-Time Delivery Tracking\nThe delivery module supports both HTTP and Socket.IO location updates. Rider devices may POST GPS points or publish `delivery:location` over the authenticated `/delivery` namespace. Customers and permitted operators join `delivery:{deliveryId}` rooms and receive `delivery.location.updated` and `delivery.status.updated` events. Authentication uses the same Secure/HttpOnly access cookie; no token is passed in localStorage, sessionStorage or a JavaScript-readable cookie.\n\nFor multiple API replicas, Socket.IO must use the Redis adapter so rooms and events are shared across instances. The current deployment is safe for a single API replica; the Redis adapter is the scaling step before horizontal WebSocket replication.\n