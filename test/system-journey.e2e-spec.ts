import type { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';
import { createHmac } from 'crypto';

import { AppModule } from '../src/app.module';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });

jest.setTimeout(30000);

describe('System Journey E2E', () => {
  let app: INestApplication;
  let adminCookie: string;
  let vendorCookie: string;
  let customerCookie: string;

  let vendorId: number;
  let customerId: number;
  let storeId: number;
  let categoryId: number;
  let productId: number;
  let storeProductId: number;
  let paymentGroupId: number;
  let paymentReference: string;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'debug', 'log'],
      rawBody: true,
    });

    app.setGlobalPrefix('purse');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.use(cookieParser());

    await app.init();

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Create Admin user
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@superstore.com';
    let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          email: adminEmail,
          firstName: 'Admin',
          lastName: 'User',
          passwordHash: await bcrypt.hash(process.env.SEED_ADMIN_PASSWORD || 'superstore@2026', 10),
          isEmailVerified: true,
        },
      });
      const superAdminRole = await prisma.role.upsert({
        where: { name: 'SUPER_ADMIN' },
        update: {},
        create: { name: 'SUPER_ADMIN', description: 'Admin', level: 100 },
      });
      await prisma.userRole.create({
        data: { userId: admin.id, roleId: superAdminRole.id },
      });
    }

    const vendor = await prisma.user.create({
      data: {
        email: `vendor-${Date.now()}@test.com`,
        firstName: 'Vendor',
        lastName: 'Test',
        passwordHash,
        isEmailVerified: true,
      },
    });
    vendorId = vendor.id;

    const customer = await prisma.user.create({
      data: {
        email: `cobodoukwu+customer${Date.now()}@gmail.com`,
        firstName: 'Customer',
        lastName: 'Test',
        passwordHash,
        isEmailVerified: true,
      },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  });

  const getCookie = (res: request.Response, name: string) => {
    const rawCookies = res.headers['set-cookie'];
    if (!rawCookies) {
      console.warn('No set-cookie header found! Headers:', res.headers);
      return '';
    }
    const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    const cookie = cookies.find((c: string) => c.startsWith(`${name}=`));
    if (!cookie) {
      console.warn(`Cookie ${name} not found in:`, cookies);
      return '';
    }
    return cookie.split(';')[0];
  };

  const req = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string) => {
    return request(app.getHttpServer())[method](url).set('Origin', 'https://app.syroltech.com');
  };

  describe('1. Admin & Vendor Onboarding', () => {
    it('should login as admin', async () => {
      const res = await req('post', '/purse/v1/auth/login')
        .send({
          email: process.env.SEED_ADMIN_EMAIL || 'admin@superstore.com',
          password: process.env.SEED_ADMIN_PASSWORD || 'superstore@2026',
        })
        .expect(201);

      adminCookie = getCookie(res, 'purse_access_token');
      expect(adminCookie).toBeTruthy();
    });

    it('should login as vendor', async () => {
      const v = await prisma.user.findUnique({ where: { id: vendorId } });
      const loginRes = await req('post', '/purse/v1/auth/login')
        .send({
          email: v!.email,
          password: 'Password123!',
        })
        .expect(201);
      vendorCookie = getCookie(loginRes, 'purse_access_token');
    });

    it('vendor applies for profile', async () => {
      await req('post', '/purse/v1/vendors/profile')
        .set('Cookie', vendorCookie)
        .send({
          phoneNumber: '+2348000000001',
          state: 'Lagos',
          city: 'Ikeja',
          address: '123 Test Vendor Ave',
        })
        .expect(201);
    });

    it('admin approves vendor', async () => {
      await req('patch', `/purse/v1/admin/vendors/${vendorId}/approve`)
        .set('Cookie', adminCookie)
        .send({ reason: 'Approved for testing' })
        .expect(200);
    });
  });

  describe('2. Vendor Creates Store and Product', () => {
    it('vendor creates a store', async () => {
      const res = await req('post', '/purse/v1/stores')
        .set('Cookie', vendorCookie)
        .send({
          storeName: 'Test E2E Store',
          description: 'A store for E2E tests',
          contactEmail: 'store@test.com',
          contactPhone: '+2348000000002',
          state: 'Lagos',
          city: 'Ikeja',
          address: '123 Test Ave',
        })
        .expect(201);

      storeId = res.body.id;
    });

    it('vendor creates a product category', async () => {
      const res = await req('post', '/purse/v1/catalog/categories')
        .set('Cookie', vendorCookie)
        .send({
          name: `E2E Test Category ${Date.now()}`,
          description: 'Test Category',
        })
        .expect(201);
      categoryId = res.body.id;
    });

    it('vendor creates a product in the catalog', async () => {
      const res = await req('post', '/purse/v1/catalog/products')
        .set('Cookie', vendorCookie)
        .send({
          name: `E2E Test Product ${Date.now()}`,
          description: 'A product for E2E tests',
          categoryId,
          barcode: `BAR-${Date.now()}`,
        })
        .expect(201);
      productId = res.body.id;
    });

    it('vendor creates a store offer for the product', async () => {
      const res = await req('post', `/purse/v1/stores/${storeId}/products`)
        .set('Cookie', vendorCookie)
        .send({
          productId,
          price: 15000,
          stockQuantity: 100,
          isActive: true,
        })
        .expect(201);
      storeProductId = res.body.id;
    });
  });

  describe('3. Customer Shopping Journey', () => {
    it('should login as customer', async () => {
      const c = await prisma.user.findUnique({ where: { id: customerId } });
      const res = await req('post', '/purse/v1/auth/login')
        .send({
          email: c!.email,
          password: 'Password123!',
        })
        .expect(201);
      customerCookie = getCookie(res, 'purse_access_token');
    });

    it('customer adds product to cart', async () => {
      await req('post', '/purse/v1/cart/items')
        .set('Cookie', customerCookie)
        .send({
          storeProductId,
          quantity: 2,
        })
        .expect(201);
    });

    it('customer checks out', async () => {
      const res = await req('post', '/purse/v1/checkout')
        .set('Cookie', customerCookie)
        .send({
          fulfillmentType: 'DELIVERY',
          address: { address: '123 Customer Address' },
          deliveryFee: 1500,
        })
        .expect(201);

      const paymentGroup = res.body.paymentGroup;
      paymentGroupId = paymentGroup.id;
    });

    it('customer initializes payment', async () => {
      const res = await req('post', '/purse/v1/payments/initialize')
        .set('Cookie', customerCookie)
        .send({
          paymentGroupId,
        })
        .expect(201);

      paymentReference = res.body.providerRef;
      expect(paymentReference).toBeTruthy();
    });

    it('processes paystack webhook', async () => {
      const payload = {
        event: 'charge.success',
        data: {
          reference: paymentReference,
        },
      };

      const payloadString = JSON.stringify(payload);
      const signature = createHmac(
        'sha512',
        process.env.PAYSTACK_SECRET_KEY || 'sk_test_dce075554489808a4b88f2205d765253cfa4a3b8',
      )
        .update(payloadString)
        .digest('hex');

      const res = await req('post', '/purse/v1/payments/paystack/webhook')
        .set('x-paystack-signature', signature)
        .set('Content-Type', 'application/json')
        .send(payloadString)
        .expect(201);

      expect(res.body.received).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 500));

      const payment = await prisma.payment.findUnique({
        where: { transactionRef: paymentReference },
      });
      expect(['FAILED', 'PENDING']).toContain(payment?.status);
    });
  });
});
