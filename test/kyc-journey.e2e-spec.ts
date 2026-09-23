import type { INestApplication } from '@nestjs/common';
import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../src/app.module';
import { QoreIDService } from '../src/qoreid/qoreid.service';

const adapter = new PrismaMariaDb(process.env.DATABASE_URL as string);
const prisma = new PrismaClient({ adapter });
jest.setTimeout(30000);

describe('KYC & CAC Verification Journey E2E', () => {
  let app: INestApplication;
  let adminCookie: string;
  let riderCookie: string;
  let storeOwnerCookie: string;

  let riderId: number;
  let storeOwnerId: number;
  let storeId: number;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'], rawBody: true });

    app.setGlobalPrefix('purse');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.use(cookieParser());

    await app.init();

    const qoreidService = app.get(QoreIDService);
    jest.spyOn(qoreidService, 'shouldAutoApprove', 'get').mockReturnValue(true);
    jest.spyOn(qoreidService, 'mintSdkSessionToken').mockResolvedValue({
      sessionId: 'test-session-id',
      sdkSessionToken: 'mock-sdk-token',
      type: 'collection',
      productCode: 'liveness',
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
    jest.spyOn(qoreidService, 'verifyNin').mockResolvedValue({
      summary: { status: 'VERIFIED', state: 'SUCCESS' },
      applicant: { firstname: 'Test', lastname: 'Rider' },
    });
    jest.spyOn(qoreidService, 'verifyNinFace').mockResolvedValue({
      summary: { status: 'VERIFIED', state: 'SUCCESS' },
      faceMatchScore: 98,
    });
    jest.spyOn(qoreidService, 'verifyCac').mockResolvedValue({
      qoreidReference: 'cac-ref-123',
      qoreidStatus: 'VERIFIED',
      qoreidRaw: { summary: { status: 'VERIFIED' } },
      companyName: 'Test Company Ltd',
      companyType: 'Private Limited',
      incorporatedAt: new Date('2020-01-01'),
    });

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Admin setup
    const adminEmail = process.env.SEED_ADMIN_EMAIL || 'admin@superstore.com';
    let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (!admin) {
      admin = await prisma.user.create({
        data: {
          email: adminEmail,
          firstName: 'Admin',
          passwordHash,
          isEmailVerified: true,
        },
      });
      const superAdminRole = await prisma.role.upsert({
        where: { name: 'SUPER_ADMIN' },
        update: {},
        create: { name: 'SUPER_ADMIN', description: 'Admin', level: 100 },
      });
      await prisma.userRole.create({ data: { userId: admin.id, roleId: superAdminRole.id } });
    }

    // Rider setup
    const rider = await prisma.user.create({
      data: {
        email: `kyc-rider-${Date.now()}@test.com`,
        firstName: 'KYC',
        lastName: 'Rider',
        passwordHash,
        isEmailVerified: true,
      },
    });
    riderId = rider.id;
    await prisma.riderProfile.create({ data: { userId: rider.id } });

    // Add RIDER role
    const riderRole = await prisma.role.upsert({
      where: { name: 'RIDER' },
      update: {},
      create: { name: 'RIDER', description: 'Rider', level: 1 },
    });
    await prisma.userRole.create({ data: { userId: rider.id, roleId: riderRole.id } });

    // Store Owner setup
    const storeOwner = await prisma.user.create({
      data: {
        email: `kyc-store-${Date.now()}@test.com`,
        firstName: 'KYC',
        lastName: 'Store',
        passwordHash,
        isEmailVerified: true,
      },
    });
    storeOwnerId = storeOwner.id;
    const store = await prisma.store.create({
      data: {
        ownerUserId: storeOwner.id,
        storeName: 'KYC Test Store',
        city: 'Lagos',
        state: 'Lagos',
        address: '123 KYC St',
        isActive: false,
      },
    });
    storeId = store.id;
    await prisma.merchantScope.create({ data: { userId: storeOwnerId, storeId } });

    // Add VENDOR role
    const vendorRole = await prisma.role.upsert({
      where: { name: 'VENDOR' },
      update: {},
      create: { name: 'VENDOR', description: 'Vendor', level: 1 },
    });
    await prisma.userRole.create({ data: { userId: storeOwnerId, roleId: vendorRole.id } });
  });

  afterAll(async () => {
    if (app) await app.close();
    await prisma.$disconnect();
  });

  const getCookie = (res: request.Response, name: string) => {
    const rawCookies = res.headers['set-cookie'];
    if (!rawCookies) return '';
    const cookies = Array.isArray(rawCookies) ? rawCookies : [rawCookies];
    const cookie = cookies.find((c: string) => c.startsWith(`${name}=`));
    return cookie ? cookie.split(';')[0] : '';
  };

  const req = (method: 'get' | 'post' | 'patch', url: string) => {
    return request(app.getHttpServer())[method](url).set('Origin', 'https://app.syroltech.com');
  };

  it('Logins', async () => {
    const adminRes = await req('post', '/purse/v1/auth/login')
      .send({
        email: process.env.SEED_ADMIN_EMAIL || 'admin@superstore.com',
        password: process.env.SEED_ADMIN_PASSWORD || 'superstore@2026',
      })
      .expect(201);
    adminCookie = getCookie(adminRes, 'purse_access_token');

    const riderRes = await req('post', '/purse/v1/auth/login')
      .send({
        email: (await prisma.user.findUnique({ where: { id: riderId } }))!.email,
        password: 'Password123!',
      })
      .expect(201);
    riderCookie = getCookie(riderRes, 'purse_access_token');

    const storeRes = await req('post', '/purse/v1/auth/login')
      .send({
        email: (await prisma.user.findUnique({ where: { id: storeOwnerId } }))!.email,
        password: 'Password123!',
      })
      .expect(201);
    storeOwnerCookie = getCookie(storeRes, 'purse_access_token');
  });

  // --- RIDER KYC ---
  let documentId: number;
  let guarantorId: number;
  let guarantorDocumentId: number;

  it('Rider creates a document', async () => {
    const res = await req('post', '/purse/v1/riders/documents')
      .set('Cookie', riderCookie)
      .send({ type: 'NIN', documentNumber: '11111111111', url: 'https://test.com/nin.jpg' })
      .expect(201);
    documentId = res.body.id;
  });

  it('Rider verifies identity document (with face match)', async () => {
    const res = await req('post', '/purse/v1/riders/kyc/verify-document')
      .set('Cookie', riderCookie)
      .send({ documentId, selfieBase64: 'base64-image-string' })
      .expect(201);

    expect(app.get(QoreIDService).verifyNinFace).toHaveBeenCalled();
    expect(res.body.qoreidStatus).toBe('VERIFIED');
    expect(res.body.status).toBe('APPROVED'); // Auto-approved via mock
  });

  it('Rider creates a guarantor and document', async () => {
    const gu = await req('post', '/purse/v1/riders/guarantors')
      .set('Cookie', riderCookie)
      .send({
        fullName: 'Guarantor Test',
        phone: '+2348000000000',
        relationship: 'BROTHER',
        address: 'Test address',
      })
      .expect(201);
    guarantorId = gu.body.id;

    // Direct DB insertion for GuarantorDocument since there's no endpoint to upload guarantor documents explicitly yet (handled via uploads mostly, but let's insert it)
    const gd = await prisma.guarantorDocument.create({
      data: {
        guarantorId,
        type: 'NIN',
        documentNumber: '22222222222',
        url: 'http://test.com/guarantor.jpg',
      },
    });
    guarantorDocumentId = gd.id;
  });

  it('Rider verifies guarantor document (no face match)', async () => {
    const res = await req('post', '/purse/v1/riders/kyc/verify-guarantor-document')
      .set('Cookie', riderCookie)
      .send({ documentId: guarantorDocumentId })
      .expect(201);

    expect(app.get(QoreIDService).verifyNin).toHaveBeenCalled();
    expect(res.body.qoreidStatus).toBe('VERIFIED');
    expect(res.body.status).toBe('APPROVED');
  });

  it('Rider mints a liveness session', async () => {
    const res = await req('post', '/purse/v1/riders/kyc/session')
      .set('Cookie', riderCookie)
      .send({ productCode: 'liveness', reference: 'ref-123' })
      .expect(201);

    expect(app.get(QoreIDService).mintSdkSessionToken).toHaveBeenCalled();
    expect(res.body.sdkSessionToken).toBe('mock-sdk-token');
  });

  // --- STORE CAC ---
  it('Store Owner submits CAC for verification', async () => {
    const res = await req('post', `/purse/v1/stores/${storeId}/cac`)
      .set('Cookie', storeOwnerCookie)
      .send({ regNumber: 'RC123456' })
      .expect(201);

    expect(app.get(QoreIDService).verifyCac).toHaveBeenCalledWith('RC123456');
    expect(res.body.status).toBe('PENDING'); // Not auto-approved
    expect(res.body.qoreidStatus).toBe('VERIFIED');
  });

  it('Store Owner fetches CAC status', async () => {
    const res = await req('get', `/purse/v1/stores/${storeId}/cac`)
      .set('Cookie', storeOwnerCookie)
      .expect(200);

    expect(res.body.regNumber).toBe('RC123456');
    expect(res.body.status).toBe('PENDING');
  });
});
