import type { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();
jest.setTimeout(30000);

describe('Vendor Journey E2E', () => {
  let app: INestApplication;
  let adminCookie: string;
  let vendorCookie: string;
  let customerCookie: string;

  let vendorId: number;
  let storeId: number;
  let orderId: number;

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
        email: `vendor-journey-${Date.now()}@test.com`,
        firstName: 'Vendor',
        lastName: 'Journey',
        passwordHash,
        isEmailVerified: true,
      },
    });
    vendorId = vendor.id;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    await prisma.$disconnect();
  });

  const getCookie = (res: request.Response, name: string) => {
    const rawCookies = res.headers['set-cookie'];
    if (!rawCookies) return '';
    const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    const cookie = cookies.find((c: string) => c.startsWith(`${name}=`));
    return cookie ? cookie.split(';')[0] : '';
  };

  const req = (method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string) => {
    return request(app.getHttpServer())[method](url).set('Origin', 'https://app.syroltech.com');
  };

  it('admin login', async () => {
    const res = await req('post', '/purse/v1/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL || 'admin@superstore.com',
        password: process.env.SEED_ADMIN_PASSWORD || 'superstore@2026',
      })
      .expect(201);
    adminCookie = getCookie(res, 'purse_access_token');
  });

  it('vendor login', async () => {
    const v = await prisma.user.findUnique({ where: { id: vendorId } });
    const loginRes = await req('post', '/purse/v1/auth/login')
      .send({ email: v!.email, password: 'Password123!' })
      .expect(201);
    vendorCookie = getCookie(loginRes, 'purse_access_token');
  });

  it('vendor applies for profile', async () => {
    await req('post', '/purse/v1/vendors/profile')
      .set('Cookie', vendorCookie)
      .send({
        phoneNumber: '+2348000000099',
        state: 'Lagos',
        city: 'Ikeja',
        address: '123 Vendor Ave',
      })
      .expect(201);
  });

  it('admin approves vendor', async () => {
    await req('patch', `/purse/v1/admin/vendors/${vendorId}/approve`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Approved for vendor journey test' })
      .expect(200);
  });

  it('vendor creates a store', async () => {
    const res = await req('post', '/purse/v1/stores')
      .set('Cookie', vendorCookie)
      .send({
        storeName: 'Vendor Journey Store',
        description: 'Testing store updates and overview',
        contactEmail: 'store-journey@test.com',
        contactPhone: '+2348000000088',
        state: 'Lagos',
        city: 'Ikeja',
        address: '123 Vendor Ave',
      })
      .expect(201);

    storeId = res.body.id;
  });

  it('vendor updates store details', async () => {
    await req('patch', `/purse/v1/stores/${storeId}`)
      .set('Cookie', vendorCookie)
      .send({
        description: 'Updated store description',
      })
      .expect(200);
  });

  it('vendor fetches store overview', async () => {
    const res = await req('get', `/purse/v1/stores/${storeId}/overview`)
      .set('Cookie', vendorCookie)
      .expect(200);

    expect(res.body.totalOrders).toBeDefined();
  });

  it('vendor fetches orders', async () => {
    const res = await req('get', '/purse/v1/orders').set('Cookie', vendorCookie).expect(200);

    expect(Array.isArray(res.body)).toBe(true);
  });
});
