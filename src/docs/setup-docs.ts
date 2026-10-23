import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';
import { apiReference } from '@scalar/nestjs-api-reference';

import { AdminModule } from '../admin/admin.module';
import { ApprovalsModule } from '../approvals/approvals.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CartModule } from '../cart/cart.module';
import { CatalogModule } from '../catalog/catalog.module';
import { CheckoutModule } from '../checkout/checkout.module';
import { BnplModule } from '../bnpl/bnpl.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { HealthModule } from '../health/health.module';
import { LocationsModule } from '../locations/locations.module';
import { MarketplaceModule } from '../marketplace/marketplace.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { QoreIDModule } from '../qoreid/qoreid.module';
import { RbacModule } from '../rbac/rbac.module';
import { ReviewsModule } from '../reviews/reviews.module';
import { RidersModule } from '../riders/riders.module';
import { SettlementsModule } from '../settlements/settlements.module';
import { StoresModule } from '../stores/stores.module';
import { UploadsModule } from '../uploads/uploads.module';
import { UsersModule } from '../users/users.module';
import { VendorsModule } from '../vendors/vendors.module';
import { StaffModule } from '../staff/staff.module';
import { RewardsModule } from '../rewards/rewards.module';
import { ReferralsModule } from '../referrals/referrals.module';
import { ChatsModule } from '../chats/chats.module';
import { SupportModule } from '../support/support.module';
import { ScanningModule } from '../scanning/scanning.module';

function addNativeBearerAlternative(document: OpenAPIObject) {
  for (const path of Object.values(document.paths)) {
    for (const operation of Object.values(path ?? {})) {
      if (!operation || typeof operation !== 'object' || !('security' in operation)) continue;
      const security = operation.security;
      if (!Array.isArray(security)) continue;
      if (
        security.some((requirement) => 'purse_access_token' in requirement) &&
        !security.some((requirement) => 'mobile_bearer' in requirement)
      ) {
        security.push({ mobile_bearer: [] });
      }
    }
  }
}

export function setupScalarDocs(app: INestApplication) {
  const serverUrl = process.env.BASE_URL ?? '/';

  const baseConfig = new DocumentBuilder()
    .setTitle('Purse Superstore API')
    .setVersion('1.0.0')
    .addServer(serverUrl, process.env.NODE_ENV === 'production' ? 'Production' : 'Local')

    .addCookieAuth(
      'purse_access_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'purse_access_token',
        description: 'Customer and Merchant Authentication Cookie',
      },
      'purse_access_token',
    )
    .addCookieAuth(
      'purse_staff_token',
      {
        type: 'apiKey',
        in: 'cookie',
        name: 'purse_staff_token',
        description: 'Admin and Staff Authentication Cookie',
      },
      'purse_staff_token',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Native/mobile access token. Browser clients should use the access cookie.',
      },
      'mobile_bearer',
    );

  const adminConfig = baseConfig
    .setDescription(
      'API for System Administrators and Back-Office Staff. ' +
        'Uses the purse_staff_token cookie. Motorcycle rider KYC combines automatic identity, liveness, and driver-licence checks with manual motorcycle photo/plate and registration review. Staff can review items separately or use the audited atomic rider decision endpoint; automatic failures cannot be overridden by bulk approval. SUPER_ADMIN directory endpoints include paginated customers, orders, payouts, stores, riders, vendors, and campaigns with their detail pages. Audited advertising push campaigns support drafts, test sends, audience and location targeting, immediate or scheduled delivery, cancellation, delivery totals, customer MARKETING opt-out preferences, and approval or rejection of vendor-created store campaigns. Other staff access remains role-scoped.',
    )
    .build();
  const adminDocument = SwaggerModule.createDocument(app, adminConfig, {
    include: [
      AdminModule,
      ApprovalsModule,
      AuditModule,
      RbacModule,
      StaffModule,
      HealthModule,
      SettlementsModule,
      QoreIDModule,

      OrdersModule,
      StoresModule,
      RidersModule,
      UsersModule,
      VendorsModule,
      NotificationsModule,
      CatalogModule,
      CheckoutModule,
      BnplModule,
      RewardsModule,
      ChatsModule,
      SupportModule,
      ScanningModule,
    ],
  });
  addNativeBearerAlternative(adminDocument);
  app.use(
    '/docs/admin',
    apiReference({
      content: adminDocument,
      theme: 'kepler',
      layout: 'modern',
    }),
  );
  SwaggerModule.setup('swagger/admin', app, adminDocument, {
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true, filter: true },
  });

  const storeConfig = baseConfig
    .setDescription(
      'API for VENDOR and STORE_AGENT roles using purse_access_token. Includes store orders, campaigns, inbox, serving riders, competitive-deal comparison, settings, catalogue operations, packing scans, handoff QR generation, fulfillment, wallets, and notifications. Approved store owners can create push campaigns for active customers who previously ordered from their store, test only on their own device, obtain administrator approval, then send immediately or schedule delivery. MARKETING opt-outs are honored and each store is limited to three campaign sends per day.',
    )
    .build();
  const storeDocument = SwaggerModule.createDocument(app, storeConfig, {
    include: [
      StoresModule,
      VendorsModule,
      CatalogModule,
      UploadsModule,
      NotificationsModule,
      SettlementsModule,
      ChatsModule,
      SupportModule,
      ScanningModule,
    ],
  });
  addNativeBearerAlternative(storeDocument);

  if (storeDocument.paths) {
    Object.keys(storeDocument.paths).forEach((path) => {
      if (path.includes('/admin/')) {
        delete storeDocument.paths[path];
      }

      if (path.endsWith('/stores') && storeDocument.paths[path].get) {
        delete storeDocument.paths[path].get;
        if (Object.keys(storeDocument.paths[path]).length === 0) {
          delete storeDocument.paths[path];
        }
      }
    });
  }
  app.use(
    '/docs/store',
    apiReference({
      content: storeDocument,
      theme: 'purple',
      layout: 'modern',
    }),
  );
  SwaggerModule.setup('swagger/store', app, storeDocument, {
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true, filter: true },
  });

  const riderConfig = baseConfig
    .setDescription(
      'API for motorcycle rider applicants and approved RIDER users using purse_access_token. KYC uses automatic liveness (no separate face match), administrator-reviewed driver-licence images, and staff review of motorcycle photo/plate and registration evidence. Bank details are required before withdrawal rather than onboarding approval; riders can manage multiple verified payout accounts, choose a primary account, and target a specific account during withdrawal. Guarantor, ownership evidence, insurance, and roadworthiness are conditional. Approved riders publish fresh GPS, go online, browse nearby delivery jobs within their registered service area, atomically claim one, verify the store handoff QR and products, then complete live tracking and customer handoff. Stores without coordinates use service-area matching as a documented fallback. Includes wallet, notifications, and assigned-delivery support tickets.',
    )
    .build();
  const riderDocument = SwaggerModule.createDocument(app, riderConfig, {
    include: [
      RidersModule,
      DeliveryModule,
      NotificationsModule,
      ScanningModule,
      UploadsModule,
      SupportModule,
    ],
  });
  addNativeBearerAlternative(riderDocument);

  if (riderDocument.paths) {
    Object.keys(riderDocument.paths).forEach((path) => {
      if (path.includes('/admin/')) {
        delete riderDocument.paths[path];
      }
    });
  }

  app.use(
    '/docs/rider',
    apiReference({
      content: riderDocument,
      theme: 'saturn',
      layout: 'modern',
    }),
  );
  SwaggerModule.setup('swagger/rider', app, riderDocument, {
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true, filter: true },
  });

  const publicConfig = baseConfig
    .setDescription(
      'API for Customers and Public access. ' +
        'Authenticated CUSTOMER routes use the purse_access_token HttpOnly cookie on web or a Bearer access token in native apps; public routes require neither. Includes passkeys, rotating refresh sessions, catalog and barcode lookup, rewards, referrals, cart, checkout, Klump provider-backed BNPL with signed webhooks and server-side verification, wallet deposit/withdrawal/ledger, asynchronous refunds, state-gated order QR display, orders/returns, store chat, support conversations, Socket.IO notifications, FCM push triggers for orders, payments, wallet funding, delivery, chat, support, rewards, and KYC, plus an independent MARKETING preference for advertising opt-out.',
    )
    .build();
  const publicDocument = SwaggerModule.createDocument(app, publicConfig, {
    include: [
      AuthModule,
      UsersModule,
      MarketplaceModule,
      CatalogModule,
      CartModule,
      CheckoutModule,
      BnplModule,
      PaymentsModule,
      OrdersModule,
      ReviewsModule,
      LocationsModule,
      NotificationsModule,
      RewardsModule,
      ReferralsModule,
      ChatsModule,
      SupportModule,
      ScanningModule,
    ],
  });
  addNativeBearerAlternative(publicDocument);
  for (const path of Object.keys(publicDocument.paths)) {
    if (path.includes('/admin/')) delete publicDocument.paths[path];
  }
  app.use(
    '/docs/public',
    apiReference({
      content: publicDocument,
      theme: 'moon',
      layout: 'modern',
    }),
  );
  SwaggerModule.setup('swagger/public', app, publicDocument, {
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true, filter: true },
  });

  const fullConfig = baseConfig
    .setDescription('Full REST API for the Purse multi-store marketplace.')
    .build();
  const fullDocument = SwaggerModule.createDocument(app, fullConfig);
  addNativeBearerAlternative(fullDocument);
  app.use('/docs', apiReference({ content: fullDocument, theme: 'moon', layout: 'modern' }));
  SwaggerModule.setup('swagger', app, fullDocument, {
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true, filter: true },
  });
}
