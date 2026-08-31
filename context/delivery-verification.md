# Delivery Verification

## Policy

A delivery is not considered complete until the assigned rider enters the customer's delivery code and the backend validates it.

## Customer channels

The delivery code is delivered through:
- in-app notification;
- transactional email.

The rider must never be shown the customer's code automatically.

## Lifecycle

1. Delivery reaches a ready/assigned state.
2. Rider requests a delivery code.
3. Backend generates a random 6-digit code.
4. Only a SHA-256 hash is persisted.
5. Customer receives the code through in-app notification and email.
6. Rider obtains the code from the customer.
7. Rider submits the code.
8. Backend validates the hash and expiry/attempt rules.
9. On success, the verification material is deleted and the delivery becomes `DELIVERED`.
10. Order status is updated to `DELIVERED`.

## Security

- 6 digits.
- 180-minute expiry by default.
- Maximum 5 failed attempts.
- Successful verification deletes the code hash.
- Expired codes are rejected.
- Repeated invalid attempts lock the verification.
- The customer should be instructed not to share the code before handover.

## Dedicated email template

The delivery code uses its own template:
`src/mail/templates/delivery-code.template.ts`.

It is registered as `deliveryCode` in the mail template registry and is sent only through the notification event for the delivery code.
