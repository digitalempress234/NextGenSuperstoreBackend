# Backend Design

## 1. Core Domain Model

```text
User --< UserRole >-- Role --< RolePermission >-- Permission

User --< Address
User --1 RiderProfile
RiderProfile --< RiderDocument
RiderProfile --< RiderLicence
RiderProfile --< Vehicle --< VehicleDocument
RiderProfile --< Guarantor --< GuarantorDocument
RiderProfile --< RiderBankAccount

Vendor/User --< Store --< StoreProduct >-- Product
Product -- Category

User --1 Cart --< CartItem >-- StoreProduct

CheckoutPaymentGroup --< CheckoutPaymentAllocation >-- Order
Order --< OrderItem
Order --0..1 Pickup
Order --0..1 Delivery --< DeliveryStatusUpdate
Delivery --< DeliveryOffer

Payment --< CheckoutPaymentGroup
```

## 2. Product Identity vs Store Offer
The old schema stores price directly on Product. The new design separates:

### Product
Canonical identity:
- name;
- barcode;
- brand;
- description;
- category;
- unit/size;
- canonical images.

### StoreProduct
Commercial offer:
- store;
- product;
- store SKU;
- price;
- discount;
- stock;
- availability;
- store-specific images if needed.

This is the basis for reliable comparison.

## 3. Checkout Design
The customer experiences one checkout. The backend may create several orders.

Example:

```text
Cart
├── Store A: ₦10,000
└── Store B: ₦5,000

CheckoutPaymentGroup: ₦15,000
├── Allocation -> Order A: ₦10,000
└── Allocation -> Order B: ₦5,000
```

Each order owns its own fulfillment state.

## 4. State Machines

### Payment
`PENDING -> PROCESSING -> PAID`
Terminal alternatives: `FAILED`, `REFUNDED`, `PARTIALLY_REFUNDED`.

### Order
`ORDER_RECEIVED -> CONFIRMED -> PREPARING -> READY`

Then:
- pickup: `READY -> PICKED_UP -> COMPLETED`
- delivery: `READY -> RIDER_ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED`

Cancellation and failure are explicit terminal/exception states governed by policy.

### Rider onboarding
`CREATED -> PROFILE_COMPLETED -> DOCUMENTS_UPLOADED -> BANK_VERIFIED -> UNDER_REVIEW -> APPROVED`

Alternative: `REJECTED`, `SUSPENDED`.

## 5. API Conventions
Recommended base:

```text
https://api.syroltech.com/purse/v1
```

Example resources:

```text
POST   /v1/auth/register
POST   /v1/auth/login
GET    /v1/products
GET    /v1/products/:id/offers
GET    /v1/stores
POST   /v1/cart/items
POST   /v1/checkout
POST   /v1/payments/initialize
POST   /v1/payments/paystack/webhook
GET    /v1/orders/:id
POST   /v1/orders/:id/pickup/verify
POST   /v1/riders/onboarding/documents
POST   /v1/deliveries/:id/accept
PATCH  /v1/deliveries/:id/status
```

## 6. Response Contract

Success:

```json
{
  "success": true,
  "data": {},
  "meta": {}
}
```

Error:

```json
{
  "success": false,
  "error": {
    "code": "ORDER_INVALID_STATE",
    "message": "Order cannot be updated from its current state",
    "details": []
  },
  "requestId": "..."
}
```

## 7. Pagination
Use stable cursor pagination for large/high-churn lists where practical. Offset pagination is acceptable for administrative datasets with controlled limits.

## 8. Background Jobs
Queue:
- email;
- notification fan-out;
- image/document post-processing;
- payment reconciliation;
- webhook retry;
- expiry reminders;
- low-stock notifications.

Jobs must be idempotent and retry-safe.
