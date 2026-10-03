# Purse Superstore Backend Architecture

This document uses separate diagrams for separate concerns. Read them from top to bottom:

1. System context — who uses the platform and which external systems surround it.
2. Deployment containers — how traffic reaches the running services.
3. Application layers — how a request moves through the NestJS application.
4. Domain modules — how the source code is divided by business responsibility.
5. Core transaction flow — how checkout, payment, orders, and notifications interact.
6. Realtime flow — how chat and delivery tracking use Socket.IO.

## 1. System context

```mermaid
flowchart LR
    Customer[Customer app]
    Vendor[Vendor and store portal]
    Rider[Rider app]
    Staff[Superadmin and staff portal]

    Purse[Purse Superstore Backend]

    Paystack[Paystack]
    Identity[Identro and QoreID]
    Google[Google Identity]
    Cloudinary[Cloudinary]
    Email[SMTP provider]

    Customer -->|Shop, pay, track, chat| Purse
    Vendor -->|Manage stores and fulfil orders| Purse
    Rider -->|KYC, deliveries, tracking| Purse
    Staff -->|Review and administer| Purse

    Purse <-->|Payments, transfers, webhooks| Paystack
    Purse <-->|Identity and business verification| Identity
    Purse <-->|Social authentication| Google
    Purse <-->|Media storage| Cloudinary
    Purse -->|Transactional email| Email
```

The backend is one application serving four role-specific client surfaces. Roles do not use separate databases.

## 2. Deployment containers

```mermaid
flowchart TB
    Internet[Mobile apps, web apps, and provider webhooks]

    subgraph Host[Production host]
        Nginx[Nginx<br/>TLS termination and WebSocket upgrade]
        Gateway[Public gateway<br/>/superstore]

        subgraph ApiContainer[API Docker container]
            Nest[NestJS application<br/>Node.js 22 · port 8084]
            Rest[REST API<br/>/purse/v1]
            Socket[Socket.IO<br/>/socket.io]
            ApiReference[Scalar and Swagger]
            Health[Health endpoint]
        end

        MySQL[(MySQL)]
        Redis[(Redis)]
    end

    Internet --> Nginx
    Nginx -->|HTTP requests| Gateway
    Nginx -->|WebSocket upgrade| Socket
    Gateway --> Nest

    Nest --> Rest
    Nest --> ApiReference
    Nest --> Health
    Rest --> MySQL
    Rest --> Redis
    Socket --> MySQL
    Socket --> Redis
    Health --> MySQL
    Health --> Redis
```

### Public addresses

| Surface             | Address                                |
| ------------------- | -------------------------------------- |
| Production gateway  | `https://api.syroltech.com/superstore` |
| Versioned REST API  | `/purse/v1/*`                          |
| Socket.IO transport | `/socket.io`                           |
| Health check        | `/purse/v1/health`                     |

## 3. NestJS application layers

```mermaid
flowchart TB
    Request[HTTP request or Socket.IO event]

    subgraph Interface[Interface layer]
        Controllers[REST controllers]
        Gateways[Socket.IO gateways]
        Webhooks[Provider webhook controllers]
        DTOs[DTO validation and OpenAPI metadata]
    end

    subgraph Security[Cross-cutting pipeline]
        Transport[Helmet · CORS · compression · cookies]
        Validation[ValidationPipe and request transformation]
        Authentication[Customer JWT or staff JWT]
        Authorization[RBAC · ownership · CSRF · throttling]
        Observability[Request context · logging · exception handling]
    end

    subgraph Application[Application layer]
        Services[Domain services and business rules]
        Workflows[Checkout · fulfilment · KYC · settlement workflows]
        Notifications[Notification and email orchestration]
    end

    subgraph Adapters[Infrastructure adapters]
        Prisma[Prisma data access]
        RedisClient[Redis client]
        ProviderClients[Paystack · Identro · QoreID · Google · Cloudinary · SMTP]
    end

    Request --> Controllers
    Request --> Gateways
    Request --> Webhooks
    Controllers --> DTOs
    Webhooks --> DTOs
    DTOs --> Transport
    Gateways --> Authentication
    Transport --> Validation --> Authentication --> Authorization
    Authorization --> Services
    Services --> Workflows
    Workflows --> Notifications
    Services --> Prisma
    Services --> RedisClient
    Workflows --> ProviderClients
    Notifications --> ProviderClients
    Services --> Observability
```

### Responsibility rules

- Controllers and gateways translate transport input into service calls.
- DTOs live inside each module's `dto/` directory and own validation/OpenAPI metadata.
- Services own business rules and authorization-sensitive state changes.
- Prisma is the durable persistence boundary.
- Redis stores short-lived coordination data, cached provider tokens, and rate-limit state.
- Provider clients isolate external APIs from domain services.

## 4. Domain module map

```mermaid
flowchart TB
    subgraph Foundation[Platform foundation]
        Logging[logging]
        PrismaModule[prisma]
        RedisModule[redis]
        Health[health]
    end

    subgraph Access[Identity and governance]
        Auth[auth]
        Users[users]
        Staff[staff]
        RBAC[rbac]
        Approvals[approvals]
        Audit[audit]
    end

    subgraph Onboarding[Business onboarding]
        Vendors[vendors]
        Riders[riders]
        Stores[stores]
        Identro[identro]
        QoreID[qoreid]
        Uploads[uploads]
    end

    subgraph Shopping[Shopping and ordering]
        Marketplace[marketplace]
        Catalog[catalog]
        Cart[cart]
        Checkout[checkout]
        Orders[orders]
        Reviews[reviews]
    end

    subgraph Logistics[Fulfilment and delivery]
        Delivery[delivery]
        Scanning[scanning]
        Locations[locations]
    end

    subgraph Money[Money and incentives]
        Payments[payments]
        Settlements[settlements]
        Rewards[rewards]
        Referrals[referrals]
        BNPL[bnpl: rollout paused]
    end

    subgraph Communication[Communication]
        Chats[chats]
        InApp[notifications]
        Support[support]
        Mail[mail]
    end

    subgraph Operations[Back-office operations]
        Admin[admin]
    end

    Foundation --> Access
    Access --> Onboarding
    Onboarding --> Shopping
    Shopping --> Logistics
    Shopping --> Money
    Logistics --> Money
    Shopping --> Communication
    Logistics --> Communication
    Communication --> Mail
    Operations -. administers .-> Access
    Operations -. administers .-> Onboarding
    Operations -. administers .-> Shopping
    Operations -. administers .-> Money
```

### Important module dependencies

| Module          | Depends on                        | Reason                                                 |
| --------------- | --------------------------------- | ------------------------------------------------------ |
| `auth`          | Redis, RBAC, mail                 | Sessions, access calculation, OTP and account email    |
| `checkout`      | Cart, payments, notifications     | Validate cart, create payment intent, notify customer  |
| `orders`        | Checkout, cart, rewards           | Place orders, maintain timeline, issue rewards         |
| `payments`      | Cart, settlements, notifications  | Verify money movement and credit wallets/orders        |
| `delivery`      | Redis, notifications, settlements | Track active rides and release earnings                |
| `scanning`      | Settlements                       | Verify physical handoff before financial completion    |
| `riders`        | Identro, QoreID                   | KYC, liveness, licence, bank, and vehicle verification |
| `vendors`       | Identro, QoreID                   | Identity and business verification                     |
| `stores`        | QoreID                            | Store and CAC verification                             |
| `notifications` | Mail                              | In-app and email delivery preferences                  |

## 5. Checkout, payment, and fulfilment flow

```mermaid
sequenceDiagram
    autonumber
    actor Customer
    participant API as Checkout API
    participant Cart as Cart service
    participant DB as MySQL via Prisma
    participant Payments as Payments service
    participant Paystack
    participant Orders as Order service
    participant Notify as Notifications
    participant Store as Store portal
    participant Rider as Rider app

    Customer->>API: Submit checkout
    API->>Cart: Validate cart, prices, stock, and offers
    Cart->>DB: Read active cart and store offers
    API->>DB: Create checkout group and per-store orders

    alt Wallet payment
        API->>Payments: Debit verified wallet balance
        Payments->>DB: Record wallet debit and payment
    else Paystack payment
        API->>Payments: Initialize Paystack transaction
        Payments->>Paystack: Create checkout session
        Paystack-->>Customer: Hosted payment page
        Paystack->>Payments: Signed webhook
        Payments->>DB: Verify and record payment idempotently
    end

    Payments->>Orders: Confirm funded orders
    Orders->>Notify: Queue order confirmation
    Notify-->>Customer: In-app notification and email
    Orders-->>Store: New confirmed order
    Store->>Orders: PREPARING then READY_FOR_PICKUP
    Orders-->>Rider: Delivery offer or assignment
    Rider->>Orders: PICKED_UP then delivery progress
    Rider->>Orders: Verify delivery code or QR
    Orders->>DB: DELIVERED then COMPLETED
```

### Order status ownership

| Stage                                                      | Owner                                      |
| ---------------------------------------------------------- | ------------------------------------------ |
| `ORDER_RECEIVED`                                           | Checkout system                            |
| `CONFIRMED`                                                | Payment verification system                |
| `PREPARING`, `READY_FOR_PICKUP`                            | Vendor or authorized store staff           |
| Assignment                                                 | Delivery workflow or authorized operations |
| `PICKED_UP`, `IN_TRANSIT`, `OUT_FOR_DELIVERY`, `DELIVERED` | Assigned rider                             |
| `COMPLETED`                                                | System after verified delivery             |
| Exceptional correction                                     | Authorized staff through an audited action |

## 6. Realtime architecture

```mermaid
flowchart LR
    subgraph Clients[Connected clients]
        Customer[Customer]
        Store[Store user]
        Rider[Rider]
    end

    Proxy[Nginx WebSocket proxy<br/>/socket.io]

    subgraph Gateways[Socket.IO gateways]
        ChatGateway[Chat gateway<br/>namespace /purse/v1/ws/chat]
        DeliveryGateway[Delivery gateway<br/>namespace /delivery]
    end

    SocketAuth[JWT extracted from HttpOnly cookie,<br/>handshake auth, or Authorization header]
    ChatService[Chat service]
    TrackingService[Delivery tracking service]
    DB[(MySQL)]
    Cache[(Redis)]

    Customer --> Proxy
    Store --> Proxy
    Rider --> Proxy

    Proxy --> ChatGateway
    Proxy --> DeliveryGateway
    ChatGateway --> SocketAuth
    DeliveryGateway --> SocketAuth

    ChatGateway --> ChatService --> DB
    DeliveryGateway --> TrackingService
    TrackingService --> DB
    TrackingService --> Cache

    ChatGateway -->|chat.message.created| Customer
    ChatGateway -->|chat.message.created| Store
    DeliveryGateway -->|delivery.location.updated| Customer
    DeliveryGateway -->|delivery.location.acknowledged| Rider
```

REST and Socket.IO chat writes share the same persistence and broadcast contract. Delivery tracking persists accepted coordinates, uses Redis for rate coordination, and broadcasts only to authorized delivery rooms.

## 7. Data ownership

```mermaid
flowchart TB
    User[User]
    Roles[Roles and permissions]
    VendorProfile[Vendor profile]
    RiderProfile[Rider profile]
    Store[Store]
    Product[Product and store offer]
    Cart[Cart]
    Order[Order]
    Payment[Payment and allocation]
    Delivery[Delivery and tracking]
    Wallets[Customer, store, and rider wallets]

    User --> Roles
    User --> VendorProfile
    User --> RiderProfile
    User --> Cart
    User --> Order
    VendorProfile --> Store
    Store --> Product
    Store --> Order
    Cart --> Product
    Cart --> Order
    Order --> Payment
    Order --> Delivery
    Payment --> Wallets
    Delivery --> Wallets
```

All roles share this relational model. Access is separated by authenticated identity, role and permission checks, resource ownership, and scoped queries rather than by separate databases.
