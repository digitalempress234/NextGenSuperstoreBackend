import { INestApplication, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PrismaClient, Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();
jest.setTimeout(30000);

describe('Wallets & Withdrawals Journey E2E', () => {
  let app: INestApplication;
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
    
    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Rider setup
    const rider = await prisma.user.create({
      data: {
        email: `wallet-rider-${Date.now()}@test.com`,
        firstName: 'Wallet',
        lastName: 'Rider',
        passwordHash,
        isEmailVerified: true,
      },
    });
    riderId = rider.id;
    const rp = await prisma.riderProfile.create({ data: { userId: rider.id } });
    
    // Add RIDER role
    const riderRole = await prisma.role.upsert({ where: { name: 'RIDER' }, update: {}, create: { name: 'RIDER', description: 'Rider', level: 1 } });
    await prisma.userRole.create({ data: { userId: rider.id, roleId: riderRole.id } });
    
    // Seed Rider Bank Account & Wallet
    await prisma.riderBankAccount.create({
      data: {
        riderId: rp.id,
        bankName: 'Test Bank',
        bankCode: '000',
        accountNumber: '1234567890',
        accountName: 'Wallet Rider',
        isPrimary: true,
      }
    });
    
    const rw = await prisma.wallet.create({
      data: {
        userId: rider.id,
        balance: 50000.00,
      }
    });
    
    await prisma.walletTransaction.create({
      data: {
        walletId: rw.id,
        amount: 50000.00,
        type: 'CREDIT',
        reference: `SEED-RIDER-${Date.now()}`,
        description: 'Test SEED funds'
      }
    });

    // Store Owner setup
    const storeOwner = await prisma.user.create({
      data: {
        email: `wallet-store-${Date.now()}@test.com`,
        firstName: 'Wallet',
        lastName: 'Store',
        passwordHash,
        isEmailVerified: true,
      },
    });
    storeOwnerId = storeOwner.id;
    const store = await prisma.store.create({
      data: {
        ownerUserId: storeOwner.id,
        storeName: 'Wallet Test Store',
        city: 'Lagos',
        state: 'Lagos',
        address: '123 Wallet St',
        isActive: true,
      }
    });
    storeId = store.id;
    await prisma.merchantScope.create({ data: { userId: storeOwnerId, storeId } });
    
    // Add VENDOR role
    const vendorRole = await prisma.role.upsert({ where: { name: 'VENDOR' }, update: {}, create: { name: 'VENDOR', description: 'Vendor', level: 1 } });
    await prisma.userRole.create({ data: { userId: storeOwnerId, roleId: vendorRole.id } });

    // Seed Store Wallet
    const sw = await prisma.storeWallet.create({
      data: {
        storeId,
        balance: 100000.00,
      }
    });
    
    await prisma.storeWalletTransaction.create({
      data: {
        walletId: sw.id,
        amount: 100000.00,
        type: 'CREDIT',
        reference: `SEED-STORE-${Date.now()}`,
        description: 'Test SEED funds'
      }
    });
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

  const req = (method: 'get' | 'post', url: string) => {
    return request(app.getHttpServer())[method](url).set('Origin', 'https://app.syroltech.com');
  };

  it('Logins', async () => {
    const riderRes = await req('post', '/purse/v1/auth/login').send({ email: (await prisma.user.findUnique({ where: { id: riderId } }))!.email, password: 'Password123!' }).expect(201);
    riderCookie = getCookie(riderRes, 'purse_access_token');

    const storeRes = await req('post', '/purse/v1/auth/login').send({ email: (await prisma.user.findUnique({ where: { id: storeOwnerId } }))!.email, password: 'Password123!' }).expect(201);
    storeOwnerCookie = getCookie(storeRes, 'purse_access_token');
  });

  // --- RIDER WALLET ---
  it('Rider fetches wallet balance', async () => {
    const res = await req('get', '/purse/v1/riders/wallet')
      .set('Cookie', riderCookie)
      .expect(200);

    expect(Number(res.body.balance)).toBe(50000);
  });

  it('Rider fetches wallet transactions', async () => {
    const res = await req('get', '/purse/v1/riders/wallet/transactions')
      .set('Cookie', riderCookie)
      .expect(200);

    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0].reference).toMatch(/^SEED-RIDER-/);
  });

  it('Rider requests a withdrawal', async () => {
    const res = await req('post', '/purse/v1/riders/wallet/withdraw')
      .set('Cookie', riderCookie)
      .send({ amount: 15000, mode: 'MANUAL' })
      .expect(201);

    expect(Number(res.body.amount)).toBe(15000);
    expect(res.body.status).toBe('PENDING');
  });

  it('Rider fetches withdrawal history', async () => {
    const res = await req('get', '/purse/v1/riders/wallet/withdrawals')
      .set('Cookie', riderCookie)
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
    expect(Number(res.body[0].amount)).toBe(15000);
    
    // Check balance was decremented
    const balRes = await req('get', '/purse/v1/riders/wallet').set('Cookie', riderCookie).expect(200);
    expect(Number(balRes.body.balance)).toBe(35000);
  });

  // --- STORE WALLET ---
  it('Store fetches wallet balance', async () => {
    const res = await req('get', `/purse/v1/stores/${storeId}/wallet`)
      .set('Cookie', storeOwnerCookie)
      .expect(200);

    expect(Number(res.body.balance)).toBe(100000);
  });

  it('Store fetches wallet transactions', async () => {
    const res = await req('get', `/purse/v1/stores/${storeId}/wallet/transactions`)
      .set('Cookie', storeOwnerCookie)
      .expect(200);

    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.items.length).toBeGreaterThan(0);
    expect(res.body.items[0].reference).toMatch(/^SEED-STORE-/);
  });

  it('Store requests a withdrawal', async () => {
    const res = await req('post', `/purse/v1/stores/${storeId}/wallet/withdraw`)
      .set('Cookie', storeOwnerCookie)
      .send({ amount: 20000, mode: 'AUTO', bankName: 'Test Bank', accountNumber: '0123456789', accountName: 'Test Store' })
      .expect(201);

    expect(Number(res.body.amount)).toBe(20000);
    expect(res.body.status).toBe('PENDING');
  });

  it('Store fetches withdrawal history', async () => {
    const res = await req('get', `/purse/v1/stores/${storeId}/wallet/withdrawals`)
      .set('Cookie', storeOwnerCookie)
      .expect(200);

    expect(res.body).toBeInstanceOf(Array);
    expect(Number(res.body[0].amount)).toBe(20000);
    
    // Check balance was decremented
    const balRes = await req('get', `/purse/v1/stores/${storeId}/wallet`).set('Cookie', storeOwnerCookie).expect(200);
    expect(Number(balRes.body.balance)).toBe(80000);
  });
});
