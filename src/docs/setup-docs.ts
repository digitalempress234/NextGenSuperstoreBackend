import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
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
    );

  const adminConfig = baseConfig
    .setDescription(
      'API for System Administrators and Back-Office Staff. ' +
        'Uses the purse_staff_token cookie. Motorcycle rider KYC combines automatic identity, liveness, and driver-licence checks with manual motorcycle photo/plate and registration review. Staff can review items separately or use the audited atomic rider decision endpoint; automatic failures cannot be overridden by bulk approval. SUPER_ADMIN directory endpoints include paginated customers, orders, payouts, stores, riders, vendors, and campaigns with their detail pages. Other staff access remains role-scoped.',
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
      'API for VENDOR and STORE_AGENT roles using purse_access_token. Includes store orders, campaigns, inbox, serving riders, competitive-deal comparison, settings, catalogue operations, packing scans, handoff QR generation, fulfillment, wallets, and notifications.',
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
      'API for motorcycle rider applicants and approved RIDER users using purse_access_token. KYC uses liveness only (no separate face match), automatically verifies Nigerian driver licences through Identro, and sends motorcycle photo/plate and registration evidence to staff review. Bank details are required before withdrawal rather than onboarding approval. Guarantor, ownership evidence, insurance, and roadworthiness are conditional. Includes delivery offers, secure QR verification, item pickup scans, delivery confirmation, live tracking, wallet, and notifications.',
    )
    .build();
  const riderDocument = SwaggerModule.createDocument(app, riderConfig, {
    include: [RidersModule, DeliveryModule, NotificationsModule, ScanningModule, UploadsModule],
  });

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
        'Authenticated CUSTOMER routes use the purse_access_token HttpOnly cookie; public routes require no cookie. Includes catalog and barcode lookup, rewards, referrals, cart, checkout, wallet deposit/withdrawal/ledger, order QR display, orders/returns, store chat, support conversations, and notifications.',
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
  app.use('/docs', apiReference({ content: fullDocument, theme: 'moon', layout: 'modern' }));
  SwaggerModule.setup('swagger', app, fullDocument, {
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true, filter: true },
  });
}
