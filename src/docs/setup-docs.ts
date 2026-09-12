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

export function setupScalarDocs(app: INestApplication) {
  const baseConfig = new DocumentBuilder()
    .setTitle('Purse Superstore API')
    .setVersion('1.0.0')
    
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
    
    

  
  const adminConfig = baseConfig
    .setDescription(
      'API for System Administrators and Back-Office Staff. ' +
      'Includes staff authentication, RBAC, KYC approvals, and auditing.',
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

  
  const storeConfig = baseConfig.setDescription('API for Store Owners and Managers.').build();
  const storeDocument = SwaggerModule.createDocument(app, storeConfig, {
    include: [StoresModule, VendorsModule, CatalogModule, UploadsModule, NotificationsModule, SettlementsModule],
  });

  
  if (storeDocument.paths) {
    Object.keys(storeDocument.paths).forEach((path) => {
      if (path.startsWith('/admin')) {
        delete storeDocument.paths[path];
      }
      
      if (path === '/stores' && storeDocument.paths[path].get) {
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

  
  const riderConfig = baseConfig.setDescription('API for Delivery Personnel.').build();
  const riderDocument = SwaggerModule.createDocument(app, riderConfig, {
    include: [RidersModule, DeliveryModule, NotificationsModule],
  });

  
  if (riderDocument.paths) {
    Object.keys(riderDocument.paths).forEach((path) => {
      if (path.startsWith('/admin')) {
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

  
  const publicConfig = baseConfig.setDescription('API for Customers and Public access.').build();
  const publicDocument = SwaggerModule.createDocument(app, publicConfig, {
    include: [
      AuthModule,
      UsersModule,
      MarketplaceModule,
      CartModule,
      CheckoutModule,
      PaymentsModule,
      OrdersModule,
      ReviewsModule,
      LocationsModule,
      NotificationsModule,
    ],
  });
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
  SwaggerModule.setup('swagger', app, fullDocument, {
    swaggerOptions: { persistAuthorization: false, displayRequestDuration: true, filter: true },
  });
}
