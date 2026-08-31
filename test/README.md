# Test Strategy

## Test layers

1. `*.unit-spec.ts` — business rules and state transitions with mocked infrastructure.
2. `*.e2e-spec.ts` — HTTP endpoint tests against the real Nest application.
3. `endpoint-cases.ts` — complete route inventory; every controller endpoint must appear here.
4. Socket tests — delivery tracking gateway authorization, room membership and location broadcasting.

## Full endpoint test

Set a real test database and Redis, then:

```bash
RUN_FULL_E2E=true npm run test:e2e
```

The endpoint smoke suite checks every documented route for correct routing and unauthenticated behavior. Business-flow suites should then be run against a disposable test database.

## Delivery tracking test flow

1. Create/seed a rider and customer.
2. Create an order and delivery assigned to the rider.
3. Rider sends `POST /purse/v1/deliveries/:id/location` or Socket.IO `delivery:location`.
4. Customer joins the Socket.IO `/delivery` namespace and emits `delivery:join`.
5. Customer receives `delivery.location.updated` in real time.
6. Customer can call `GET /purse/v1/deliveries/:id/location` for the latest persisted point.
7. Customer can call `GET /purse/v1/deliveries/:id/locations?limit=100` for history.
8. Rider status changes emit `delivery.status.updated`.
