# Marketplace API

The marketplace API is the customer-facing commerce surface.

## Customer journey

```text
GET  /purse/v1/marketplace/home
        ↓
GET  /purse/v1/marketplace/browse?q=milk
        ↓
GET  /purse/v1/marketplace/products/:id
        ↓
GET  /purse/v1/marketplace/products/:id/compare
        ↓
POST /purse/v1/cart/items
PATCH /purse/v1/cart/items/:storeProductId
GET  /purse/v1/cart
        ↓
POST /purse/v1/checkout
        ↓
POST /purse/v1/payments/initialize
        ↓
Paystack
        ↓
GET /purse/v1/orders
GET /purse/v1/orders/:id
        ↓
GET /purse/v1/deliveries/:id/location
Socket.IO delivery tracking
```

## Browse

`GET /marketplace/home`

Used to populate the marketplace landing screen.

`GET /marketplace/browse`

Supports:
- keyword search;
- category filter;
- store filter;
- price range;
- sorting;
- pagination.

## Product detail

`GET /marketplace/products/:id`

Returns:
- canonical product;
- images;
- category;
- verified reviews;
- active store offers;
- store information;
- lowest/highest current offer.

## Stores

`GET /marketplace/stores`

Supports keyword/state/city search.

`GET /marketplace/stores/:id`

Returns the public store page and active catalog offers.

## Wishlist

- `GET /marketplace/wishlist`
- `POST /marketplace/wishlist`
- `DELETE /marketplace/wishlist/:productId`

## Product comparison

- `GET /marketplace/compare-list`
- `POST /marketplace/compare-list`
- `DELETE /marketplace/compare-list/:productId`

Maximum comparison list size: 10 products.

## Cart

- `GET /cart`
- `POST /cart/items`
- `PATCH /cart/items/:storeProductId`
- `DELETE /cart/items/:storeProductId`
- `DELETE /cart/items`

A cart item always points to a store-specific offer (`StoreProduct`). This is what allows the frontend to purchase the exact price/store option selected by the customer.

## Checkout

Checkout creates one payment group and one order per store represented in the customer's cart.

## Orders and delivery

Customer order history and detail:
- `GET /orders`
- `GET /orders/:id`

Delivery tracking:
- REST location endpoints;
- Socket.IO live updates.

## Frontend implementation

Frontend state should be derived from API responses. Do not persist authentication tokens in browser storage. Authentication remains Secure + HttpOnly cookie based.
