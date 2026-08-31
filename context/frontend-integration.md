# Frontend Integration Contract

## Base URLs

Production:

```text
https://api.syroltech.com/purse/v1
```

Swagger:

```text
https://api.syroltech.com/purse/docs
```

## Authentication — HttpOnly Secure Cookies Only

The API does **not** expose access or refresh JWTs to JavaScript.

The browser receives:

```text
purse_access_token
purse_refresh_token
```

Both are:

- `HttpOnly`
- `Secure`
- HTTPS-only in production
- `SameSite=Lax` by default
- scoped to `/purse`

Do **not** store JWTs, session IDs, permissions, or authentication secrets in:

```text
localStorage
sessionStorage
IndexedDB
JavaScript-readable cookies
```

The frontend must use browser credentials:

```ts
const response = await fetch('https://api.syroltech.com/purse/v1/auth/login', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email,
    password,
  }),
});
```

Axios:

```ts
const api = axios.create({
  baseURL: 'https://api.syroltech.com/purse/v1',
  withCredentials: true,
});
```

### Login

```http
POST /auth/login
Content-Type: application/json
```

```json
{
  "email": "customer@example.com",
  "password": "StrongPassword123!"
}
```

The response does **not** contain an access token or refresh token:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": 1001,
      "email": "customer@example.com",
      "roles": ["CUSTOMER"],
      "permissions": ["products.view", "stores.view"]
    },
    "session": {
      "authenticated": true
    }
  }
}
```

### Refresh

```http
POST /auth/refresh
Cookie: purse_refresh_token=<browser-managed-cookie>
```

Frontend code only needs:

```ts
await api.post('/auth/refresh');
```

The server rotates the authentication cookies. JavaScript never receives their values.

### Logout

```ts
await api.post('/auth/logout');
```

The server revokes the session and clears both cookies.

### Authenticated request

```ts
await api.get('/users/me');
```

Do not create an `Authorization: Bearer ...` header in the frontend.

### Frontend page refresh

The browser cookie is the persisted authentication mechanism. On application startup call:

```ts
await api.get('/users/me');
```

or:

```ts
await api.post('/auth/refresh');
```

Do not rebuild authentication state from localStorage/sessionStorage.

### CSRF / CORS

Because authentication uses cookies, production CORS must use a specific allowlist and `credentials: true`.
Never configure `Access-Control-Allow-Origin: *` together with credentials.

For browser clients, always send requests through the configured API client with `credentials: include` / `withCredentials: true`.

## Customer endpoints

| Method | Path | Permission | Purpose |
|---|---|---|---|
| POST | `/auth/register` | Public | Register |
| POST | `/auth/login` | Public | Login |
| GET | `/users/me` | Auth | Profile |
| GET | `/users/me/access` | Auth | Roles/permissions |
| GET | `/catalog/products` | Public | Search + price comparison |
| GET | `/catalog/products/:id` | Public | Product + offers |
| GET | `/catalog/categories` | Public | Categories |
| GET | `/stores` | Public | Stores |
| GET | `/cart` | Auth | Cart |
| POST | `/cart/items` | Auth | Add item |
| DELETE | `/cart/items/:storeProductId` | Auth | Remove item |
| POST | `/checkout` | Auth | Create orders/payment group |
| POST | `/payments/initialize` | Auth | Initialize Paystack |
| GET | `/orders` | Auth | My orders |
| GET | `/orders/:id` | Auth | Order detail |
| POST | `/reviews` | Auth | Review |
| GET | `/reviews/product/:productId` | Public | Reviews |
| GET | `/notifications` | Auth | Notifications |
| PATCH | `/notifications/:id/read` | Auth | Mark notification read |

## Store endpoints

```text
GET    /stores/mine
POST   /stores
PATCH  /stores/:id
POST   /stores/:id/products
POST   /catalog/products
PATCH  /catalog/products/:id
DELETE /catalog/products/:id
POST   /catalog/categories
```

Store-level permissions include:

```text
stores.create
stores.update
stores.activate
stores.suspend
products.create
products.update
products.archive
products.price.update
inventory.adjust
orders.view
orders.status.update
```

## Order status workflow

```text
ORDER_RECEIVED
      |
      v
  CONFIRMED
      |
      v
  PREPARING
      |
      +----------------------+
      |                      |
      v                      v
READY_FOR_PICKUP      RIDER_ASSIGNED
      |                      |
      v                      v
 PICKED_UP            OUT_FOR_DELIVERY
      |                      |
      +----------+-----------+
                 v
             DELIVERED
                 |
                 v
             COMPLETED
```

Invalid transitions must return a business error.

## Multi-store checkout response

A checkout can generate several store orders while using one payment group:

```json
{
  "paymentGroup": {
    "id": 1001,
    "totalAmount": 15500,
    "currency": "NGN",
    "status": "PENDING"
  },
  "orders": [
    {
      "id": 501,
      "storeId": 10,
      "total": 10000,
      "fulfillmentType": "DELIVERY"
    },
    {
      "id": 502,
      "storeId": 12,
      "total": 5500,
      "fulfillmentType": "DELIVERY"
    }
  ]
}
```

The frontend should store the `paymentGroup.id`, not try to construct payment references itself.

## Rider endpoints

```text
GET  /riders/me
POST /riders/profile
POST /riders/documents
POST /riders/vehicles
POST /riders/bank-accounts
POST /riders/guarantors
POST /riders/submit
```

Required onboarding areas include identity/KYC documents, liveness, rider licence, vehicle documentation, payout account, emergency/next-of-kin information and guarantor details.

## Admin endpoints

```text
GET   /admin/riders/review
PATCH /admin/riders/:id/approve
PATCH /admin/riders/:id/reject
PATCH /admin/rider-documents/:id/review
PATCH /admin/stores/:id/activate
```

## RBAC endpoints

```text
GET    /rbac/roles
GET    /rbac/permissions
POST   /rbac/roles/assign
DELETE /rbac/roles/:userId/:roleName
POST   /rbac/permission-overrides
```

## Approval endpoints

```text
POST /approvals
GET  /approvals/pending
POST /approvals/:id/decision
```

Sensitive actions should use approval workflows where policy requires it.

## Audit endpoints

```text
GET /audit/logs
```

## Common error format

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "Required permission is missing."
  },
  "requestId": "req_01JABC123"
}
```

The frontend should display `error.message` for user-facing errors and log `requestId` for support/debugging.


## In-App Notifications

All authenticated browser requests use the HttpOnly secure authentication cookies; do not store notification/auth tokens in browser storage.

### List notifications
```http
GET /purse/v1/notifications?page=1&limit=20&unreadOnly=false
```
Response:
```json
{
  "items": [
    {
      "id": 41,
      "title": "Order status updated",
      "message": "Order PUR-123 is now CONFIRMED.",
      "type": "ORDER_STATUS_UPDATE",
      "priority": "MEDIUM",
      "isRead": false,
      "readAt": null,
      "data": { "orderId": 123, "orderNumber": "PUR-123", "status": "CONFIRMED" },
      "createdAt": "2026-08-25T18:30:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 },
  "unreadCount": 1
}
```

### Unread count
```http
GET /purse/v1/notifications/unread-count
```

### Mark one read
```http
PATCH /purse/v1/notifications/41/read
```

### Mark all read
```http
PATCH /purse/v1/notifications/read-all
```

### Notification preferences
```http
GET /purse/v1/notifications/preferences
PATCH /purse/v1/notifications/preferences
Content-Type: application/json

{
  "type": "ORDER_STATUS_UPDATE",
  "inApp": true,
  "email": true
}
```

## Email templates

Transactional templates are version-controlled under `src/mail/templates/email.templates.ts`. Current templates include order received, order status changed, payment received, payment failed, rider assigned, delivery completed, KYC update, and system announcement. Email sends are recorded in the `EmailLog` table for delivery/audit visibility.


## Notification UX recommendation

Display the `unreadCount` as the notification badge. Poll `/notifications/unread-count` on app focus/navigation or use a future SSE/WebSocket channel. The database remains the source of truth, so notifications are not lost when the user is offline.

## OTP / password recovery

### Email verification
1. `POST /auth/register`
2. User receives the email verification OTP.
3. `POST /auth/verify-email` with `{ email, otp }`.
4. Retry with `POST /auth/resend-email-otp` after the server cooldown.

### Forgot password
1. `POST /auth/forgot-password` with `{ email }`.
2. The UI shows a generic confirmation regardless of account existence.
3. User receives the six-digit password reset OTP when applicable.
4. `POST /auth/reset-password` with `{ email, otp, password }`.
5. Existing sessions are revoked after a successful reset.

### Login
`POST /auth/login` authenticates with email/password and immediately issues secure HttpOnly authentication cookies. Login OTP is not used.


## Google Sign-In / Sign-Up

Use Google Identity Services in the browser. When Google returns its credential, POST it to:

`POST /purse/v1/auth/google`

```json
{
  "idToken": "<Google ID token>"
}
```

The frontend must send cookies with the request. The response does not contain access/refresh tokens; the backend sets Secure/HttpOnly cookies.

```ts
await fetch('https://api.syroltech.com/purse/v1/auth/google', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ idToken: googleCredential }),
});
```

## Rider onboarding controls

Use `GET /purse/v1/riders/onboarding/requirements` to render document guidance and `GET /purse/v1/riders/me` to read `canSubmit`. Keep the submit button disabled while `canSubmit` is false. Email is not a rider form field; use the authenticated user's email.

Use `GET /purse/v1/locations/states?search=Lag` and `GET /purse/v1/locations/cities?state=Lagos&search=Ike` for searchable dropdowns.

Use `GET /purse/v1/riders/banks` for the bank dropdown and `POST /purse/v1/riders/bank-accounts/resolve` to auto-resolve account name before saving.

### Rider submit button

Do not enable the submit button just because fields are populated. Use the backend `canSubmit` flag and keep the button disabled until it is `true`. The API validates the same conditions, so changing the browser state cannot bypass onboarding requirements.
\n\n## Live Delivery Tracking\nConnect to Socket.IO using the API origin and the `/delivery` namespace with browser credentials enabled. The browser sends the Secure/HttpOnly access cookie automatically.\n\n```ts\nconst socket = io('https://api.syroltech.com/purse/delivery', {\n  withCredentials: true,\n  transports: ['websocket'],\n});\n\nsocket.emit('delivery:join', { deliveryId });\nsocket.on('delivery.location.updated', (position) => {\n  // update the map marker\n});\nsocket.on('delivery.status.updated', (event) => {\n  // update order/delivery status\n});\n```\n\nHTTP fallback endpoints:\n- `GET /purse/v1/deliveries/:id/location`\n- `GET /purse/v1/deliveries/:id/locations?limit=100`\n- `POST /purse/v1/deliveries/:id/location` for rider GPS updates.\n