import { MarketplaceModule } from './marketplace/marketplace.module';
import { LoggingModule } from './logging/logging.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AdminModule } from './admin/admin.module';
import { AuditModule } from './audit/audit.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AuthModule } from './auth/auth.module';
import { CartModule } from './cart/cart.module';
import { CatalogModule } from './catalog/catalog.module';
import { CheckoutModule } from './checkout/checkout.module';
import { DeliveryModule } from './delivery/delivery.module';
import { HealthModule } from './health/health.module';
import { IdentroModule } from './identro/identro.module';
import { MailModule } from './mail/mail.module';
import { LocationsModule } from './locations/locations.module';
import { NotificationsModule } from './notifications/notifications.module';
import { OrdersModule } from './orders/orders.module';
import { PaymentsModule } from './payments/payments.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { RbacModule } from './rbac/rbac.module';
import { RidersModule } from './riders/riders.module';
import { ReviewsModule } from './reviews/reviews.module';
import { StoresModule } from './stores/stores.module';
import { UploadsModule } from './uploads/uploads.module';
import { UsersModule } from './users/users.module';
import { VendorsModule } from './vendors/vendors.module';
import { JwtGuard } from './auth/jwt.guard';
import { CsrfGuard } from './common/csrf.guard';
import { PermissionGuard } from './common/permission.guard';
import { StaffModule } from './staff/staff.module';
import { BnplModule } from './bnpl/bnpl.module';

@Module({
  imports: [
    LoggingModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AdminModule,
    AuditModule,
    ApprovalsModule,
    RedisModule,
    RbacModule,
    AuthModule,
    UsersModule,
    HealthModule,
    CatalogModule,
    StoresModule,
    CartModule,
    CheckoutModule,
    PaymentsModule,
    OrdersModule,
    RidersModule,
    DeliveryModule,
    ReviewsModule,
    NotificationsModule,
    MailModule,
    MarketplaceModule,
    LocationsModule,
    UploadsModule,
    VendorsModule,
    StaffModule,
    IdentroModule,
    BnplModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: CsrfGuard,
    },
  ],
})
export class AppModule {}
