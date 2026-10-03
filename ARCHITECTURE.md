# Purse Superstore Backend Architecture

This file describes the deployed system, its NestJS module boundaries, shared infrastructure, realtime channels, and external providers. GitHub renders the Mermaid diagrams below directly.

## System architecture

```mermaid
flowchart TB
    subgraph Clients[Client applications]
        Customer[Customer mobile and web apps]
        Vendor[Vendor and store portal]
        Rider[Rider and logistics app]
        Admin[Superadmin and staff portal]
    end

    subgraph Edge[Edge and deployment]
        Nginx[Nginx TLS and WebSocket proxy]
        Gateway[Public gateway under /superstore]
        Container[Docker container: Node.js 22 on port 8084]
    end

    Customer -->|HTTPS and purse_access_token| Nginx
    Vendor -->|HTTPS and purse_access_token| Nginx
    Rider -->|HTTPS and Socket.IO| Nginx
    Admin -->|HTTPS and purse_staff_token| Nginx
    Nginx --> Gateway --> Container

    subgraph Application[NestJS application]
        direction TB

        subgraph Interfaces[Interface adapters]
            REST[REST controllers: /purse/v1]
            Socket[Socket.IO gateways: /socket.io]
            OpenAPI[Scalar and Swagger OpenAPI surfaces]
            Health[Health: API, MySQL, and Redis]
            Webhook[Paystack webhook receiver]
        end

        subgraph Pipeline[Cross-cutting request pipeline]
            Transport[Helmet, CORS, compression, cookies, validation]
            Security[Customer JWT, staff JWT, RBAC, CSRF, throttling]
            Observability[Request context, structured logging, exception filter]
        end

        subgraph Domains[Domain modules]
            Identity[Auth, users, staff, RBAC, approvals, audit]
            Onboarding[Vendors, riders, KYC, stores]
            Commerce[Marketplace, catalog, cart, checkout, orders, reviews]
            Fulfilment[Delivery, live tracking, locations, QR and item scanning]
            Finance[Payments, wallets, settlements, rewards, referrals, BNPL]
            Engagement[Chats, notifications, support, mail, uploads]
            Operations[Admin directories and operational controls]
        end

        Prisma[Global Prisma service]
        RedisClient[Global Redis service]
    end

    Container --> REST
    Container --> Socket
    Container --> OpenAPI
    Container --> Health
    Container --> Webhook

    REST --> Transport --> Security --> Domains
    Socket --> Security
    Security --> Observability
    OpenAPI -. generated from controllers and DTOs .-> REST

    Identity --> Onboarding
    Onboarding --> Commerce
    Commerce --> Finance
    Commerce --> Fulfilment
    Fulfilment --> Finance
    Commerce --> Engagement
    Fulfilment --> Engagement
    Operations --> Identity
    Operations --> Onboarding
    Operations --> Commerce
    Operations --> Finance

    Domains --> Prisma
    Identity --> RedisClient
    Onboarding --> RedisClient
    Fulfilment --> RedisClient
    Health --> Prisma
    Health --> RedisClient

    subgraph Data[Shared infrastructure]
        MySQL[(MySQL: one relational database for every role)]
        Redis[(Redis: token cache, rate limits, and tracking coordination)]
    end

    Prisma --> MySQL
    RedisClient --> Redis

    subgraph Providers[External providers]
        Paystack[Paystack payments, transfers, banks, and webhooks]
        Identro[Identro identity, liveness, and driver licence]
        QoreID[QoreID identity and CAC verification]
        Google[Google Identity]
        Cloudinary[Cloudinary media storage]
        SMTP[SMTP email provider]
    end

    Finance <--> Paystack
    Webhook <-->|signed events| Paystack
    Onboarding <--> Identro
    Onboarding <--> QoreID
    Identity <--> Google
    Engagement <--> Cloudinary
    Engagement --> SMTP
```

## NestJS module dependencies

```mermaid
flowchart LR
    App[AppModule]

    App --> Auth
    App --> Commerce
    App --> Fulfilment
    App --> Money
    App --> Communication
    App --> Administration
    App --> Infrastructure

    subgraph Auth[Identity and access]
        AuthModule
        UsersModule
        RbacModule
        StaffModule
        VendorsModule
        RidersModule
        ApprovalsModule
        AuditModule
    end

    subgraph Commerce[Marketplace and ordering]
        MarketplaceModule
        CatalogModule
        StoresModule
        CartModule
        CheckoutModule
        OrdersModule
        ReviewsModule
    end

    subgraph Fulfilment[Fulfilment]
        DeliveryModule
        ScanningModule
        LocationsModule
    end

    subgraph Money[Money and incentives]
        PaymentsModule
        SettlementsModule
        RewardsModule
        ReferralsModule
        BnplModule
    end

    subgraph Communication[Communication]
        ChatsModule
        NotificationsModule
        SupportModule
        MailModule
        UploadsModule
    end

    subgraph Administration[Operations]
        AdminModule
        HealthModule
    end

    subgraph Infrastructure[Global infrastructure]
        PrismaModule
        RedisModule
        LoggingModule
        IdentroModule
        QoreIDModule
    end

    CheckoutModule --> CartModule
    CheckoutModule --> PaymentsModule
    CheckoutModule --> NotificationsModule
    OrdersModule --> CheckoutModule
    OrdersModule --> CartModule
    OrdersModule --> RewardsModule
    PaymentsModule --> CartModule
    PaymentsModule --> SettlementsModule
    PaymentsModule --> NotificationsModule
    DeliveryModule --> NotificationsModule
    DeliveryModule --> SettlementsModule
    DeliveryModule --> RedisModule
    ScanningModule --> SettlementsModule
    NotificationsModule --> MailModule
    AuthModule --> RbacModule
    AuthModule --> MailModule
    AuthModule --> RedisModule
    RidersModule --> IdentroModule
    RidersModule --> QoreIDModule
    VendorsModule --> IdentroModule
    VendorsModule --> QoreIDModule
    StoresModule --> QoreIDModule
    AdminModule --> StaffModule
    AdminModule --> NotificationsModule
```

## Request lifecycle

1. Nginx terminates TLS and forwards application traffic through the public gateway.
2. NestJS applies transport middleware, DTO validation, authentication, authorization, CSRF protection, and rate limits.
3. Controllers delegate business rules to domain services.
4. Services use the global Prisma client for durable state and Redis for short-lived coordination or caching.
5. Payments, identity checks, uploads, and email are delegated to external providers.
6. Domain changes produce in-app notifications, email, or Socket.IO events where applicable.

## Authentication boundaries

- Customers, vendors, store agents, and riders use the `purse_access_token` HttpOnly cookie.
- Superadmins and back-office staff use the separate `purse_staff_token` HttpOnly cookie.
- Authorization is enforced by backend roles, granular permissions, ownership checks, and audited operational actions.
- Socket.IO accepts the customer access token through the cookie, handshake auth field, or Authorization header. Query-string tokens are rejected.

## Data ownership

The platform uses one MySQL database. Customers, vendors, store agents, riders, and staff are separated through relational ownership, roles, permissions, and scoped queries rather than separate databases.

## Realtime channels

| Capability          | Socket.IO path | Namespace           | Main rooms/events                                                      |
| ------------------- | -------------- | ------------------- | ---------------------------------------------------------------------- |
| Delivery tracking   | `/socket.io`   | `/delivery`         | Delivery rooms, location updates, acknowledgements, and status updates |
| Customer/store chat | `/socket.io`   | `/purse/v1/ws/chat` | `chat:join`, `chat:message`, and `chat.message.created`                |

## Deployment model

The production image is built in three stages: dependency installation, TypeScript/Prisma compilation, and a minimal Node.js runtime. The entrypoint can apply committed Prisma migrations before starting `dist/main.js`. MySQL and Redis are external runtime dependencies, while the API listens on port `8084` inside the container.
