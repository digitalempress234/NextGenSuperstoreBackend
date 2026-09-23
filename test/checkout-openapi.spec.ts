import { Module, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { CartController } from '../src/cart/cart.controller';
import { CartService } from '../src/cart/cart.service';
import { CheckoutController } from '../src/checkout/checkout.controller';
import {
  CheckoutSettingsController,
  PickupStationsController,
} from '../src/checkout/checkout-settings.controller';
import { CheckoutService } from '../src/checkout/checkout.service';
import { CheckoutSettingsService } from '../src/checkout/checkout-settings.service';
import { BnplAdminController, BnplController } from '../src/bnpl/bnpl.controller';
import { BnplService } from '../src/bnpl/bnpl.service';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
import { PaymentsController } from '../src/payments/payments.controller';
import { PaymentWebhookController } from '../src/payments/payment-webhook.controller';
import { WalletController } from '../src/payments/wallet.controller';
import { PaymentsService } from '../src/payments/payments.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { AddressesController } from '../src/users/addresses.controller';
import { UsersService } from '../src/users/users.service';
import { StaffJwtGuard } from '../src/staff/staff-jwt.guard';

const controllers = [
  CartController,
  CheckoutController,
  CheckoutSettingsController,
  PickupStationsController,
  BnplController,
  BnplAdminController,
  OrdersController,
  PaymentsController,
  PaymentWebhookController,
  WalletController,
  AddressesController,
];
const services = [
  CartService,
  CheckoutService,
  CheckoutSettingsService,
  BnplService,
  OrdersService,
  PaymentsService,
  PrismaService,
  UsersService,
  ConfigService,
];

@Module({ controllers, providers: services.map((service) => ({ provide: service, useValue: {} })) })
class DocsFixtureModule {}

describe('Checkout OpenAPI contract shared by Swagger and Scalar', () => {
  it('exposes the checkout routes, cookies, and multipart upload', async () => {
    const fixture = await Test.createTestingModule({ imports: [DocsFixtureModule] })
      .overrideGuard(StaffJwtGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = fixture.createNestApplication();
    app.setGlobalPrefix('purse');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .addCookieAuth(
            'purse_access_token',
            { type: 'apiKey', in: 'cookie', name: 'purse_access_token' },
            'purse_access_token',
          )
          .addCookieAuth(
            'purse_staff_token',
            { type: 'apiKey', in: 'cookie', name: 'purse_staff_token' },
            'purse_staff_token',
          )
          .build(),
      );
      const routes = Object.entries(document.paths);
      expect(document.paths).toHaveProperty('/purse/v1/cart');
      const operation = (suffix: string, method: string) => {
        const match = routes.find(([path]) => path.endsWith(suffix));
        expect(match).toBeDefined();
        return match?.[1]?.[method as 'get'] as
          | {
              requestBody?: { content?: Record<string, unknown> };
              security?: Array<Record<string, string[]>>;
            }
          | undefined;
      };
      expect(operation('/cart', 'get')).toBeDefined();
      expect(operation('/cart/items', 'post')).toBeDefined();
      expect(operation('/addresses', 'post')).toBeDefined();
      expect(operation('/pickup-stations', 'get')).toBeDefined();
      expect(operation('/wallet/balance', 'get')).toBeDefined();
      expect(operation('/orders', 'post')).toBeDefined();
      expect(operation('/orders/{id}/track', 'get')).toBeDefined();
      expect(operation('/payments/callback', 'get')).toBeDefined();
      expect(operation('/webhooks/payment', 'post')).toBeDefined();
      expect(operation('/bnpl/installment-plans', 'get')).toBeDefined();
      const apply = operation('/bnpl/apply', 'post');
      expect(apply?.requestBody?.content?.['multipart/form-data']).toBeDefined();
      expect(apply?.security).toContainEqual({ purse_access_token: [] });
      expect(operation('/admin/bnpl/plans', 'get')?.security).toContainEqual({
        purse_staff_token: [],
      });
      expect(document.components?.securitySchemes).toHaveProperty('purse_access_token');
      expect(document.components?.securitySchemes).toHaveProperty('purse_staff_token');
    } finally {
      await app.close();
    }
  });
});
