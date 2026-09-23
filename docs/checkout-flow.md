# Checkout API integration guide

The same OpenAPI contract is available in Scalar at `/docs/public` (customer routes), `/docs/admin` (staff configuration and BNPL review), and `/docs` (all routes); and in Swagger at `/swagger/public`, `/swagger/admin`, and `/swagger`. These are application routes; a deployment reverse proxy may prepend its own path. Authentication remains cookie based.

All paths below are relative to **/purse/v1**. This guide refines the supplied Flutter screen-flow document for the existing multi-store backend.

## Authentication and response compatibility

Use the existing HttpOnly authentication cookies. Browser requests need `credentials: include`; retain the cookie jar in a native client. Do not switch to bearer tokens. Staff endpoints use the separate `purse_staff_token` session.

Existing successful responses remain unwrapped JSON objects/arrays. Decimal monetary fields serialize as decimal strings; parse them for display, but never submit calculated totals as authoritative values. Currency is NGN.

Errors retain the application's envelope, with meaningful messages and structured conflict details:

```json
{
  "success": false,
  "error": {
    "code": "CONFLICT",
    "message": "Some items are unavailable",
    "data": {
      "unavailableItems": [
        { "productId": 101, "storeProductId": 42, "requestedQuantity": 3, "availableStock": 1 }
      ]
    }
  }
}
```

## Screen sequence

1. Product detail: add the selected store offer to the cart.
2. Shopping cart: read, update, remove, or clear items.
3. Checkout: fetch saved addresses, pickup stations, and checkout options.
4. Payment option: read wallet balance or available BNPL plans.
5. Checkout review: call `POST /checkout/review` for current prices and server-calculated shipping.
6. Card, OPay, or wallet: call `POST /orders`.
7. Card/OPay: open `paymentUrl`, then poll the payment group or request verification after returning.
8. BNPL: upload an application, await staff approval, then confirm it.
9. Completed screen: use every order in `orders[]`; a checkout may contain several store orders.

## Cart

| Method | Route | Input / behavior |
|---|---|---|
| GET | /cart | Creates an empty cart if needed; returns current prices, totals, and items |
| POST | /cart/items | `{ "storeProductId": 42, "quantity": 1 }` |
| PATCH | /cart/items/:storeProductId | `{ "quantity": 3 }` sets quantity |
| DELETE | /cart/items/:storeProductId | Removes the selected offer |
| DELETE | /cart | Clears the cart; existing /cart/items alias also remains |

`productId` identifies the shared product; `storeProductId` identifies a seller's offer. Prefer the latter. Add-to-cart also accepts `{ "productId": 101, "storeId": 7, "quantity": 1 }`. Product ID alone works only if one eligible offer exists; ambiguous selection returns 409. Quantity updates/removal always use the returned `storeProductId`.

Each cart item includes the existing `storeProduct` relation plus `productId`, `totalPrice`, and a display-oriented `product` object. `totalItems` is the sum of quantities.

## Addresses and pickup stations

| Method | Route |
|---|---|
| GET, POST | /addresses |
| PATCH, DELETE | /addresses/:addressId |
| GET | /pickup-stations |
| GET | /checkout/options |
| GET | /wallet/balance |

The existing `/users/me/addresses` routes remain available.

Address fields: `address`, `state`, and either `town` or `city` are required. Optional fields: `firstName`, `lastName`, `phone`, `additionalPhone`, `email`, `additionalInfo`, `label`, `latitude`, `longitude`, `isDefault`. Missing recipient name/email/phone falls back to the account at checkout. If both city and town are supplied, they must match.

First address defaults automatically; choosing a new default clears the old one transactionally. Deleting the default selects another address if present. Address operations and checkout verify ownership.

Pickup stations come from the database. Only active stations appear to customers. Checkout snapshots the selected station and delivery recipient details.

## Review and place an order

Send the same selection to `POST /checkout/review` and `POST /orders`:

```json
{
  "cartId": 12,
  "deliveryMethod": "home_delivery",
  "addressId": 1,
  "paymentMethod": "card"
}
```

For pickup, use `deliveryMethod: "store_pickup"` and `pickupStationId`, omitting address fields.

Payment methods: `card`, `wallet`, and `opay` when enabled. OPay opens Paystack's **Bank** channel; the customer selects OPay there. The merchant's Paystack account must support it.

Review returns `subtotal`, `shippingFee`, `tax`, `total`, and store-specific `orders`. Delivery currently uses an admin-configured fixed fee **per store order**; pickup is free. No additional customer tax is introduced. Existing merchant settlement deductions remain separate. Client-supplied `deliveryFee` is no longer accepted.

Placement returns:

```json
{
  "paymentGroupId": 20,
  "paymentGroup": { "id": 20, "status": "PROCESSING", "currency": "NGN", "totalAmount": "121500" },
  "orderId": 101,
  "orderNumber": "PUR-...",
  "orders": [],
  "paymentStatus": "processing",
  "paymentMethod": "card",
  "paymentReference": "PUR-20-...",
  "paymentUrl": "https://checkout.paystack.com/...",
  "subtotal": "120000",
  "shippingFee": "1500",
  "tax": "0",
  "total": "121500",
  "currency": "NGN"
}
```

`orderId` is a convenience for the first order. Always retain `paymentGroupId` and render `orders[]` for multi-store checkouts. Wallet payment returns `paid` and a null payment URL.

The existing two-step API remains: `POST /checkout` creates/resumes a group, then `POST /payments/initialize` with `paymentGroupId`. Legacy checkout supports `fulfillmentType`, but pickup now requires a station and delivery prices come from server settings.

## Payment lifecycle and recovery

| Method | Route | Purpose |
|---|---|---|
| GET | /checkout/:paymentGroupId | Checkout summary |
| GET | /payments/groups/:paymentGroupId | Poll local payment status |
| POST | /payments/groups/:paymentGroupId/verify | Verify with Paystack and return updated summary |
| POST | /checkout/:paymentGroupId/cancel | Cancel a checkout with no initialized payment |
| GET | /payments/callback?reference=... | Paystack redirect callback |
| POST | /webhooks/payment | Signed Paystack webhook |
| POST | /payments/paystack/webhook | Existing webhook alias |

Stock is reserved atomically at order creation. Cart items remain until payment succeeds. Success removes the purchased quantities while preserving unrelated additions. Failed wallet debits roll back the entire checkout. Verified Paystack failure restores reserved stock once and retains the cart.

Repeated pending submissions reuse the same checkout and payment reference. A simultaneous initialization may briefly return a null URL; poll the group while the first request completes. A changed delivery/payment selection returns 409 with the existing payment-group ID.

Callbacks and webhooks share verification logic. The server checks transaction reference, currency, and exact kobo amount. Duplicate confirmations do not settle twice. Pending/ongoing/abandoned payments are not treated as failed. An initialized payment cannot be cancelled locally while its provider outcome is uncertain. Every five minutes, the server checks up to 50 unresolved Paystack payments once they are at least two minutes old. It releases reserved stock only after Paystack verifies failure. Provider outages remain pending and are retried; reservations are not automatically released on a timer.

The callback redirects to the server-configured `PAYMENT_APP_RETURN_URL`. When unset, verified success and failure use the screen flow's deep links:

```text
superstore://payment-success?status=paid&paymentGroupId=20&orderId=101
superstore://payment-failed?status=failed&paymentGroupId=20&orderId=101
```

An unresolved payment uses `superstore://payment-pending` with `status=pending`. `orderId` is the first store order; use `paymentGroupId` to fetch all orders. Re-fetch the authenticated summary before showing the result. Set `PAYSTACK_CALLBACK_URL` to the deployed API's callback route. Never accept a callback target from the client.

## BNPL

| Method | Route | Purpose |
|---|---|---|
| GET | /bnpl/installment-plans?provider=wallet_bnpl&cartId=12 | Active plans for the cart subtotal |
| POST | /bnpl/apply | Multipart application and document |
| GET | /bnpl/applications | Customer's applications |
| GET | /bnpl/applications/:applicationId | Status, quote, and approved terms |
| POST | /bnpl/applications/:applicationId/cancel | Cancel pending/approved application |
| POST | /bnpl/confirm | `{ "applicationId": 123 }` |

Providers: `nextgen_purse`, `easybuy`, `wallet_bnpl`. Plan IDs are database integers, not the document's sample `plan_3m` strings.

Multipart fields: `provider`, `planId`, `cartId`, `deliveryMethod`, conditional `addressId`/`pickupStationId`, `employerName`, `monthlyIncome`, `accountNumber` (10 digits), `bankName`, `nibssConsent=true`, and `document` (PDF/PNG/JPEG, at most 5 MB). File signatures are checked.

Only one active application per cart is allowed. Application terms include delivery, snapshot the configured flat interest rate, and put the rounding remainder into the final installment. Confirmation requires staff approval, rechecks the quote, and creates the financed checkout transactionally. Changed cart/prices/address/settings require a new application. Repeated confirmation returns the same result.

Customer statuses: `pending_review`, `approved`, `rejected`, `cancelled`, `confirmed`. Confirmation returns `{ application, checkout }` with an installment schedule in `application.plan`.

This is **staff-approved financing**, recorded as a MANUAL payment backed by the approval. No lender API, provider disbursement, NIBSS mandate creation, or automatic repayment collection is claimed. Consent is recorded; it does not establish a bank mandate. Enable a provider only after its actual financing process and terms are in place.

Documents and account numbers are encrypted at rest with AES-256-GCM. Customer responses mask account numbers. Documents are available only through an authenticated, audited staff download route.

## Administration

Use staff authentication for these routes. SUPER_ADMIN has access to all.

| Method | Route | Additional allowed staff roles |
|---|---|---|
| GET, PUT | /admin/checkout/settings | OPERATIONS_ADMIN, FINANCE_ADMIN |
| GET, POST | /admin/checkout/pickup-stations | OPERATIONS_ADMIN |
| PATCH | /admin/checkout/pickup-stations/:id | OPERATIONS_ADMIN |
| GET | /admin/bnpl/plans | CREDIT_BNPL_ADMIN, FINANCE_ADMIN |
| POST | /admin/bnpl/plans | CREDIT_BNPL_ADMIN |
| PATCH | /admin/bnpl/plans/:id | CREDIT_BNPL_ADMIN |
| GET | /admin/bnpl/applications?page=1&limit=20 | CREDIT_BNPL_ADMIN, RISK_COMPLIANCE_ADMIN |
| PATCH | /admin/bnpl/applications/:id/review | CREDIT_BNPL_ADMIN |
| GET | /admin/bnpl/applications/:id/document | CREDIT_BNPL_ADMIN, RISK_COMPLIANCE_ADMIN |

Settings body:

```json
{ "deliveryFeePerStore": 1500, "deliveryEnabled": true, "opayEnabled": true }
```

These are illustrative values, not seeded settings. Delivery and OPay default to disabled. Pickup stations are not seeded with the sample document's addresses.

Station body: `name`, `address`, `state`, `city`, `phone`; optional `latitude`, `longitude`, `isActive`. Deactivate rather than deleting historical station records.

Plan body: `provider`, `label`, `months` (1–60), `interestRate` (flat percentage, 0–100), `isActive`. No sample plan rates are seeded.

Review body: `{ "status": "APPROVED", "reason": "..." }` or `REJECTED`. A reviewer cannot approve an application belonging to their own email identity. Settings, station changes, plan changes, review decisions, and document access are audited.

## Post-order screens

Existing routes remain `GET /orders`, `GET /orders/:id`, and `GET /orders/:id/track`. Listing accepts `page`, `limit`, and `status=all|pending|in_progress|ready_for_pickup|delivered|cancelled`, and retains its array response for existing clients. List/detail objects include screen-friendly status and payment fields alongside their original fields. Tracking includes `currentLocation` and a timeline derived from recorded events. `estimatedDelivery` is null until a reliable ETA source is configured. Existing order and delivery status enums remain uppercase in the original fields.

`POST /orders/:id/reorder` restores fulfilled-order items at current prices. It returns `{ status, cart, addedItems, skippedItems }`; partial availability uses HTTP 207. It does not silently switch sellers.

## Deployment and validation

Apply `prisma/migrations/20260916120000_checkout_flow/migration.sql` with the normal Prisma migration command, regenerate the client, and restart the API. This migration is additive.

Set `BNPL_DATA_KEY` to 32 random bytes encoded as 64 hex characters. Keep the key stable and back it up securely; replacing it makes existing encrypted documents unreadable. A local development key was configured without printing it. Deployment environments need their own managed key.

Focused tests: `npm test -- --runTestsByPath test/checkout-flow.spec.ts`.

Database integration runner: `npx tsx test/checkout-flow.mysql.integration.ts`, using `CHECKOUT_TEST_DATABASE_URL`. It accepts an isolated local `checkout_test` database, or local `purse` only with `CHECKOUT_TEST_USE_LOCAL_DB=true`. It creates uniquely identified fixtures, simulates Paystack responses, and cleans up in finally. It never exercises live payment charges or bank debits.

