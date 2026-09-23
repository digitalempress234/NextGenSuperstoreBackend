# Purse mobile checkout integration handoff

This is the API contract for the mobile flow from **Add to cart → Cart → Checkout → Payment → Order completion and tracking**. It describes the implemented backend, which differs in a few places from the original screen-flow examples. Use the live OpenAPI reference for the full schemas: Scalar at `/docs/public`, Swagger at `/swagger/public`, and the JSON spec at `/swagger/public-json` on the API host. A reverse proxy may prepend its own path to those documentation URLs.

## Connection and session

- API route prefix: **`/purse/v1`**. The configured production host in this repository is `https://api.syroltech.com`, so a production API URL would be `https://api.syroltech.com/purse/v1` once this revision is deployed. Confirm the deployed host with the backend team.
- Keep the existing cookie authentication. Login at `POST /auth/login` sets HttpOnly `purse_access_token` and `purse_refresh_token` cookies. Store and resend them with a native HTTP cookie jar, including requests after a payment WebView closes. Browser-based clients need credentials enabled. Call `POST /auth/refresh` when the access session expires. Do **not** send an `Authorization: Bearer` header in place of the cookies.
- Successful responses are plain JSON objects or arrays. They are **not** wrapped in `{ "status": "success", "data": ... }`. Money is NGN; decimal amounts are serialized as strings such as `"121500.00"`. Display those as currency, but use the server's quote and total for payment.
- For browser-originated writes, the `Origin` must be in the backend's allowed CORS origins. Native requests with no `Origin` header use the existing cookie session.

## Screen-to-API sequence

| Mobile step           | Request                                                                                                          | What to use                                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Product detail        | `POST /cart/items`                                                                                               | Add the **store offer** ID and quantity.                          |
| Cart                  | `GET /cart`                                                                                                      | Render `items`, `subtotal`, and `totalItems`.                     |
| Quantity/remove/clear | `PATCH /cart/items/:storeProductId`, `DELETE /cart/items/:storeProductId`, `DELETE /cart`                        | Use each line's `storeProductId`, not `productId`.                |
| Delivery selection    | `GET /addresses`, `GET /pickup-stations`, `GET /checkout/options`                                                | Show only available delivery and payment choices.                 |
| Add an address        | `POST /addresses`                                                                                                | Save the address, then use its `id` at checkout.                  |
| Payment selection     | `GET /wallet/balance`; optionally `GET /bnpl/installment-plans?provider=...&cartId=...`                          | Check wallet balance or active BNPL plans.                        |
| Review                | `POST /checkout/review`                                                                                          | Render server-calculated subtotal, per-store shipping, and total. |
| Card, OPay, wallet    | `POST /orders`                                                                                                   | Keep `paymentGroupId` and every entry in `orders[]`.              |
| Card or OPay result   | Open `paymentUrl`, then `GET /payments/groups/:paymentGroupId` or `POST /payments/groups/:paymentGroupId/verify` | Show completion only after `paymentStatus` is `paid`.             |
| BNPL                  | `POST /bnpl/apply`, poll `GET /bnpl/applications/:id`, then `POST /bnpl/confirm` after approval                  | Confirmation returns `{ application, checkout }`.                 |
| After checkout        | `GET /orders`, `GET /orders/:id`, `GET /orders/:id/track`                                                        | Show each store order and its tracking.                           |

### Coverage of the uploaded 20-endpoint flow

All routes below use `/purse/v1` instead of the uploaded document's `/api/v1`. Rows marked **backend** are part of the payment flow but are not calls the mobile app should make.

| Original # | Implemented route                                                                                                          | Mobile use                                                                                                                           |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 1–5        | `GET /cart`; `POST /cart/items`; `PATCH /cart/items/:storeProductId`; `DELETE /cart/items/:storeProductId`; `DELETE /cart` | Cart screen, quantity, remove, clear. The path ID is a seller's offer ID.                                                            |
| 6–8        | `GET /addresses`; `POST /addresses`; `DELETE /addresses/:id`                                                               | Saved addresses, add, delete. `PATCH /addresses/:id` is also available.                                                              |
| 9–10       | `GET /pickup-stations`; `GET /wallet/balance`                                                                              | Pickup selection and wallet balance.                                                                                                 |
| 11         | `POST /orders`                                                                                                             | Place card, OPay, or wallet order.                                                                                                   |
| 12–13      | `GET /payments/callback`; `POST /webhooks/payment`                                                                         | **Backend/Paystack:** browser redirect and signed server webhook. The app handles the resulting deep link and checks payment status. |
| 14–16      | `GET /bnpl/installment-plans`; `POST /bnpl/apply`; `POST /bnpl/confirm`                                                    | Financing selection, application, confirmation after approval.                                                                       |
| 17–20      | `GET /orders`; `GET /orders/:id`; `GET /orders/:id/track`; `POST /orders/:id/reorder`                                      | Order history, details, tracking, order again.                                                                                       |

## Cart and delivery examples

Add the selected seller's offer:

```http
POST /purse/v1/cart/items
Content-Type: application/json

{"storeProductId":42,"quantity":1}
```

`productId` alone is accepted only when exactly one eligible seller offer exists. When several sellers carry a product, the server returns 409; select a `storeProductId` instead. The cart response includes product display fields and current server prices. `totalItems` is the sum of quantities.

For a saved home address, send `address`, `state`, and either `town` or `city`. `firstName`, `lastName`, `phone`, `email`, `additionalPhone`, `additionalInfo`, and `isDefault` are supported. The checkout can fall back to the account's contact details when optional recipient fields are omitted.

`GET /checkout/options` returns `deliveryEnabled`, `deliveryFeePerStore`, `opayEnabled`, `paymentMethods`, and `currency`. `GET /pickup-stations` returns only active stations. The mobile app should handle an empty station list and disabled delivery or OPay; administrators control those settings. Pickup is free. Home-delivery fees are charged **per store order**.

## Review and place an order

Send the **same selection** to review and order placement:

```http
POST /purse/v1/checkout/review
Content-Type: application/json

{"cartId":12,"deliveryMethod":"home_delivery","addressId":1,"paymentMethod":"card"}
```

For pickup, use `"deliveryMethod":"store_pickup"` and `"pickupStationId":4`; omit `addressId`. Payment methods are `card`, `wallet`, and `opay` when listed in `/checkout/options`. Do not send a calculated delivery fee or total. Review returns `subtotal`, `shippingFee`, `tax`, `total`, and store-specific `orders`.

```http
POST /purse/v1/orders
Content-Type: application/json

{"cartId":12,"deliveryMethod":"home_delivery","addressId":1,"paymentMethod":"card"}
```

The placement response has this shape (amounts and IDs are examples):

```json
{
  "paymentGroupId": 20,
  "paymentGroup": {
    "id": 20,
    "status": "PROCESSING",
    "totalAmount": "121500.00",
    "currency": "NGN"
  },
  "orderId": 101,
  "orderNumber": "PUR-...",
  "orders": [{ "id": 101, "orderNumber": "PUR-...", "total": "121500.00" }],
  "paymentStatus": "processing",
  "paymentMethod": "card",
  "paymentReference": "PUR-20-...",
  "paymentUrl": "https://checkout.paystack.com/...",
  "subtotal": "120000.00",
  "shippingFee": "1500.00",
  "tax": "0.00",
  "total": "121500.00",
  "currency": "NGN"
}
```

A cart can contain products from several stores. That creates **multiple orders in one payment group**. `orderId` is only the first order. Use `orders[]` for the completion screen and retain `paymentGroupId` for payment checks. Wallet payment returns `paymentStatus: "paid"` and `paymentUrl: null`. Cart lines are removed after confirmed payment, not when `/orders` is first called.

The backend snapshots item prices in the order and reserves stock when orders are created. Verified payment failure restores the reserved stock. Paystack amounts are sent in **kobo** by the backend (NGN × 100); the mobile app should not perform that conversion or generate a payment reference. The backend creates a unique `PUR-...` reference for the payment group, signs/verifies webhook traffic, and verifies the transaction with Paystack before marking orders paid. This differs from the uploaded document's illustrative `SUPERSTORE-{orderId}-{timestamp}` reference because one checkout can contain several store orders.

### Card and OPay return

For card or enabled OPay, open `paymentUrl` in a WebView or external browser. OPay uses Paystack's bank channel, where the customer selects OPay; its availability depends on the merchant's Paystack account. Handle these default deep links if the backend has no custom `PAYMENT_APP_RETURN_URL`:

```text
superstore://payment-success?status=paid&paymentGroupId=20&orderId=101
superstore://payment-failed?status=failed&paymentGroupId=20&orderId=101
superstore://payment-pending?status=pending&paymentGroupId=20&orderId=101
```

On any return, fetch `GET /payments/groups/:paymentGroupId` with the customer cookie. If still pending, call `POST /payments/groups/:paymentGroupId/verify` or poll; show a pending state until the server confirms success or failure. The server verifies Paystack's reference, amount, and currency. Do not infer payment success from WebView closure, a query parameter, or a client-side Paystack response. A repeated `/orders` request with the same pending selection resumes the payment group. A different selection while a group is pending returns 409 with that group's ID.

## BNPL flow

1. Query `GET /bnpl/installment-plans?provider=wallet_bnpl&cartId=12`. Supported provider codes are `nextgen_purse`, `easybuy`, and `wallet_bnpl`; only admin-created active plans appear. Plan IDs are **integers**.
2. Submit `POST /bnpl/apply` as `multipart/form-data` with `provider`, `planId`, `cartId`, `deliveryMethod`, `addressId` or `pickupStationId`, `employerName`, `monthlyIncome`, `accountNumber` (10 digits), `bankName`, `nibssConsent=true`, and a `document` (PDF, PNG, or JPEG, maximum 5 MB).
3. Save the returned `applicationId`. Show `pending_review` and poll `GET /bnpl/applications/:id`; the customer can also use `GET /bnpl/applications`. Only after the status becomes `approved` should the app enable final confirmation.
4. Call `POST /bnpl/confirm` with `{ "applicationId": 123 }`. Read the installment schedule from `application.plan.schedule` and the store orders from `checkout.orders[]`. Confirmation requires an unchanged cart and quote; if they changed, start a fresh application.

BNPL currently records **staff-approved financing**. The recorded NIBSS consent is not a live bank mandate, and this backend does not collect installments automatically or call a lender API. Do not label the user as enrolled in automatic direct debit. Hide the BNPL option when no real plans are configured.

## Orders and errors

`GET /orders?page=1&limit=20&status=in_progress` accepts `all`, `pending`, `in_progress`, `ready_for_pickup`, `delivered`, or `cancelled`. It returns an **array**, with screen fields including `orderId`, `status`, `paymentStatus`, `paymentMethod`, `itemDescription`, and `firstItemImage` alongside the existing order data. `GET /orders/:id` adds delivery details and a recorded status timeline. `GET /orders/:id/track` includes `currentStatus`, `currentLocation` when available, `timeline`, and the existing delivery/pickup tracking data. `estimatedDelivery` may be `null`; do not show an invented date.

`POST /orders/:id/reorder` re-adds available items from a fulfilled order. A partial result returns HTTP 207 with `{ "status":"partial", "cart":..., "addedItems":..., "skippedItems":... }`; show skipped items to the customer.

Errors use this shape:

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
  },
  "requestId": "..."
}
```

Use `error.message` for a general message and `error.data.unavailableItems` to refresh stock/price conflicts. Address and cart validation can return 400, missing resources 404, unauthenticated sessions 401, and a duplicate active BNPL application 422. Keep `requestId` for support reports.

## Integration checklist

- Persist the cookie jar across API calls and payment WebView/browser return; test login, refresh, and logout on the target device.
- Register the `superstore://` deep-link scheme in the mobile app, or coordinate a custom backend return URL before release.
- Test a multi-store cart and display every returned order.
- Test payment success, verified failure, pending status, retry, and a 409 stock conflict with the backend test environment.
- Enable only the delivery, pickup, OPay, and BNPL choices actually returned by the API; configuration and live financing arrangements are backend/operations responsibilities.

For additional response fields and administrative setup, see [the detailed checkout guide](checkout-flow.md) and the live Scalar/Swagger references.
