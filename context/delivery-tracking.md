# Real-Time Delivery Tracking

## Transport
The backend exposes Socket.IO at `https://api.syroltech.com/purse/delivery`. Browser clients must use `withCredentials: true`; authentication comes from the Secure/HttpOnly `purse_access_token` cookie.

## Rider events
- `delivery:location` — rider sends `{ deliveryId, latitude, longitude, accuracyM?, speedKph?, headingDeg?, batteryLevel? }`.
- `delivery:join` — subscribes a rider/customer/operator to an authorized delivery room.
- `delivery:leave` — leaves the delivery room.

## Server events
- `delivery.location.updated` — real-time location broadcast to the delivery room.
- `delivery.location.ack` — acknowledgement to the submitting rider.
- `delivery.status.updated` — emitted when a delivery status transitions.

## REST fallback
- `POST /purse/v1/deliveries/:id/location`
- `GET /purse/v1/deliveries/:id/location`
- `GET /purse/v1/deliveries/:id/locations?limit=100`

## Authorization
A delivery room may only be joined by the customer who owns the order or the rider assigned to the delivery. GPS writes are restricted to the assigned rider.

## Data retention
Location points are persisted for audit/tracking history. Configure retention with `DELIVERY_LOCATION_RETENTION_DAYS`; production deployments should add a scheduled purge job and database index/partition strategy as volume grows.
