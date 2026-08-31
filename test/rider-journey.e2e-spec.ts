import { INestApplication, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();
jest.setTimeout(30000);

describe('Rider Journey E2E', () => {
  let app: INestApplication;
  let adminCookie: string;
  let riderCookie: string;

  let riderId: number;
  let riderProfileId: number;

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

    const rider = await prisma.user.create({
      data: {
        email: `rider-journey-${Date.now()}@test.com`,
        firstName: 'Rider',
        lastName: 'Journey',
        passwordHash,
        isEmailVerified: true,
      },
    });
    riderId = rider.id;
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

  it('rider login', async () => {
    const r = await prisma.user.findUnique({ where: { id: riderId } });
    const loginRes = await req('post', '/purse/v1/auth/login')
      .send({ email: r!.email, password: 'Password123!' })
      .expect(201);
    riderCookie = getCookie(loginRes, 'purse_access_token');
  });

  it('rider fetches onboarding requirements', async () => {
    await req('get', '/purse/v1/riders/onboarding/requirements')
      .set('Cookie', riderCookie)
      .expect(200);
  });

  it('rider saves profile', async () => {
    const res = await req('post', '/purse/v1/riders/profile')
      .set('Cookie', riderCookie)
      .send({
        areaOfOperation: 'Lagos Island',
        emergencyContactName: 'Test Contact',
        emergencyContactPhone: '+2348000000000',
      })
      .expect(201);

    riderProfileId = res.body.id;
  });

  it('rider saves document', async () => {
    await req('post', '/purse/v1/riders/documents')
      .set('Cookie', riderCookie)
      .send({
        type: 'NIN',
        documentNumber: '12345678901',
        url: 'https://test.com/nin.jpg',
      })
      .expect(201);
  });

  it('rider saves vehicle info', async () => {
    await req('post', '/purse/v1/riders/vehicles')
      .set('Cookie', riderCookie)
      .send({
        type: 'BICYCLE',
        make: 'Honda',
        model: 'Civic',
        year: 2018,
        plateNumber: 'ABC123XY',
        color: 'Black',
        ownershipType: 'OWNED',
      })
      .expect(201);
  });

  it('rider saves guarantor info', async () => {
    await req('post', '/purse/v1/riders/guarantors')
      .set('Cookie', riderCookie)
      .send({
        fullName: 'Guarantor Name',
        phone: '+2348000000066',
        address: '456 Guarantor St',
        relationship: 'BROTHER',
      })
      .expect(201);
  });

  it('rider saves bank account', async () => {
    await req('post', '/purse/v1/riders/bank-accounts')
      .set('Cookie', riderCookie)
      .send({
        bankCode: '001',
        bankName: 'Test Bank',
        accountNumber: '0000000000',
        accountName: 'Test Account',
      })
      .expect(201);
  });

  it('rider submits application', async () => {
    await req('post', '/purse/v1/riders/submit').set('Cookie', riderCookie).expect(201);
  });

  it('admin approves rider', async () => {
    await req('patch', `/purse/v1/admin/riders/${riderProfileId}/approve`)
      .set('Cookie', adminCookie)
      .send({ reason: 'Approved for rider journey test' })
      .expect(200);
  });

  it('rider fetches their deliveries overview', async () => {
    await req('get', '/purse/v1/deliveries/overview').set('Cookie', riderCookie).expect(200);
  });

  it('rider fetches offers', async () => {
    await req('get', '/purse/v1/deliveries/offers').set('Cookie', riderCookie).expect(200);
  });
});
