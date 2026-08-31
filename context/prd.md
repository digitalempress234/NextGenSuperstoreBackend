# Purse Superstore Marketplace — Product Requirements Document

## 1. Product Summary
Purse is a multi-store marketplace that allows customers to discover products from multiple stores, compare prices, place a single checkout across eligible stores, and receive orders through store pickup or rider delivery.

The MVP is derived from the supplied project scope and the existing backend schema. The core proposition is price transparency, multi-vendor commerce, and practical fulfillment.

## 2. Vision
Create a trusted marketplace where customers can compare equivalent products across stores and choose the best combination of price, availability, and fulfillment option.

## 3. Users
- Customer: browses, compares, carts, pays, tracks, picks up, reviews.
- Vendor: owns/manages a store and its catalog and orders.
- Store staff/agent: prepares and hands over orders.
- Rider: completes approved deliveries.
- Platform admin: manages platform operations, onboarding, documents, disputes, and configuration.

## 4. MVP Goals
1. Multi-store storefronts.
2. Master product catalog with store-specific listings.
3. Product search and comparison.
4. Cart supporting items from multiple stores.
5. Checkout that splits fulfillment into store orders while preserving one customer payment group.
6. Online payment through Paystack.
7. Pickup and delivery fulfillment.
8. Rider onboarding and document review.
9. Notifications and transactional emails.
10. Role-based access control.

## 5. Functional Requirements

### 5.1 Identity and access
- Email/password authentication.
- Email verification and password reset.
- JWT-based authenticated sessions.
- RBAC using users, roles, permissions, user_roles and role_permissions.
- Account status: active, inactive, suspended.

### 5.2 Catalog and price comparison
A master product represents the canonical product identity. StoreProduct represents a store's commercial offer.

A customer can:
- search products;
- view available store offers;
- compare price, discount, stock/availability, and store location;
- add a selected store offer to cart.

### 5.3 Stores and vendors
- Vendor onboarding and profile.
- One or more authorized staff members per store.
- Store address, operating state/city and status.
- Product, price and stock management.
- Order preparation workflow.

### 5.4 Cart and checkout
A cart may contain StoreProduct offers from multiple stores.

Checkout creates:
- one CheckoutPaymentGroup;
- one or more Orders, grouped by store;
- CheckoutPaymentAllocations linking the customer payment to each order.

The payment must not be treated as successful until Paystack verification confirms it.

### 5.5 Fulfillment
Fulfillment type:
- PICKUP
- DELIVERY

Pickup:
1. Store receives order.
2. Store prepares order.
3. Unique pickup code/QR token is generated.
4. Customer or authorized collector presents the code.
5. Agent verifies and releases the order.

Delivery:
1. Delivery record is created.
2. Approved rider may receive/accept an offer or be assigned.
3. Pickup is verified.
4. Rider updates delivery states.
5. Delivery completion is confirmed.

### 5.6 Rider onboarding
Required data may include:
- personal profile and operational area;
- identity documents including NIN or approved government ID;
- profile photograph;
- selfie/liveness verification;
- motorcycle/driver licence where applicable;
- vehicle details and supporting documents;
- bank account details and account verification;
- emergency contact/next of kin;
- guarantor information and guarantor documents.

All onboarding requirements are configurable by policy and jurisdiction. Document approval must be auditable.

### 5.7 Notifications and communication
- In-app notifications.
- Email notifications via Nodemailer.
- Order, payment, delivery and onboarding events.
- Retryable asynchronous delivery for non-critical messages.

### 5.8 Reviews and support
- Verified-purchase product/store reviews.
- Admin/customer support conversations.
- Moderation capability.

## 6. Non-Functional Requirements
- REST API under `https://api.syroltech.com/purse`.
- Versioned API recommended: `/purse/v1/...`.
- Consistent error contract.
- Pagination, filtering and sorting for list endpoints.
- Auditability for privileged operations.
- Idempotency for payment callbacks and order/payment creation.
- Sensitive documents stored externally, not in database blobs.
- Redis-backed caching, rate limiting and job coordination where appropriate.

## 7. Out of Scope for MVP
- AI price prediction.
- Dynamic AI pricing.
- Demand forecasting.
- Blockchain verification.
- Advanced route optimization.
- Live shopping and influencer commerce.
- Native mobile applications.
- Complex loyalty/gamification unless explicitly prioritized.

## 8. Success Criteria
- Customer can discover equivalent offers from multiple stores.
- Customer can pay successfully and receive store-specific orders.
- Vendor can manage listings and fulfill orders.
- Approved rider can complete a delivery with status history.
- Admin can review onboarding and manage access.
