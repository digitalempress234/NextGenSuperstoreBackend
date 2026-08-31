import { INestApplication, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import request from 'supertest';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

import { AppModule } from '../src/app.module';

const prisma = new PrismaClient();
jest.setTimeout(30000);

describe('Shopping Journey E2E', () => {
  let app: INestApplication;
  let customerCookie: string;
  let customerId: number;
  let storeId: number;
  let storeProductId: number;
  let productId: number;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn', 'debug', 'log'], rawBody: true });

    app.setGlobalPrefix('purse');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.use(cookieParser());

    await app.init();
    
    const passwordHash = await bcrypt.hash('Password123!', 10);
    
    const customer = await prisma.user.create({
      data: {
        email: `shopping-journey-${Date.now()}@test.com`,
        firstName: 'Shopping',
        lastName: 'Journey',
        passwordHash,
        isEmailVerified: true,
      },
    });
    customerId = customer.id;

    // We need an active product offer to interact with
    const store = await prisma.store.create({
      data: {
        storeName: 'Shopping Test Store',
        email: 'shopping@test.com',
        phone: '+2348000000000',
        state: 'Lagos',
        city: 'Ikeja',
        address: '123 Test',
        ownerUserId: customerId, // mock vendor ownership for simplicity
      },
    });
    storeId = store.id;

    const category = await prisma.category.create({
      data: { name: `Cat ${Date.now()}` },
    });

    const product = await prisma.product.create({
      data: {
        name: `Shop Prod ${Date.now()}`,
        categoryId: category.id,
        barcode: `SHOP-${Date.now()}`,
      },
    });
    productId = product.id;

    const offer = await prisma.storeProduct.create({
      data: {
        storeId: store.id,
        productId: product.id,
        price: 5000,
        stockQuantity: 50,
        isActive: true,
      },
    });
    storeProductId = offer.id;

    // Create a completed order to allow reviews
    await prisma.order.create({
      data: {
        orderNumber: `SHOP-${Date.now()}`,
        userId: customerId,
        storeId: store.id,
        fulfillmentType: 'PICKUP',
        currentStatus: 'COMPLETED',
        customerName: 'Shopping Test',
        customerEmail: 'shopping@test.com',
        subtotal: 5000,
        total: 5000,
        items: {
          create: {
            storeProductId: offer.id,
            productId: product.id,
            quantity: 1,
            unitPrice: 5000,
            totalPrice: 5000,
            productName: product.name,
          }
        }
      }
    });
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

  it('customer login', async () => {
    const c = await prisma.user.findUnique({ where: { id: customerId } });
    const loginRes = await req('post', '/purse/v1/auth/login')
      .send({ email: c!.email, password: 'Password123!' })
      .expect(201);
    customerCookie = getCookie(loginRes, 'purse_access_token');
  });

  it('adds product to wishlist', async () => {
    await req('post', '/purse/v1/marketplace/wishlist')
      .set('Cookie', customerCookie)
      .send({ productId })
      .expect(201);
  });

  it('fetches wishlist', async () => {
    await req('get', '/purse/v1/marketplace/wishlist')
      .set('Cookie', customerCookie)
      .expect(200);
  });

  it('removes from wishlist', async () => {
    await req('delete', `/purse/v1/marketplace/wishlist/${productId}`)
      .set('Cookie', customerCookie)
      .expect(200);
  });

  it('adds product to compare list', async () => {
    await req('post', '/purse/v1/marketplace/compare-list')
      .set('Cookie', customerCookie)
      .send({ productId })
      .expect(201);
  });

  it('removes from compare list', async () => {
    await req('delete', `/purse/v1/marketplace/compare-list/${productId}`)
      .set('Cookie', customerCookie)
      .expect(200);
  });

  it('writes a product review', async () => {
    await req('post', '/purse/v1/reviews')
      .set('Cookie', customerCookie)
      .send({
        productId,
        storeId,
        rating: 5,
        comment: 'Excellent product!',
      })
      .expect(201);
  });

  it('reads product reviews', async () => {
    await prisma.review.updateMany({
      where: { productId },
      data: { status: 'APPROVED' },
    });

    const res = await req('get', `/purse/v1/reviews/product/${productId}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('reads notifications', async () => {
    await req('get', '/purse/v1/notifications')
      .set('Cookie', customerCookie)
      .expect(200);
  });
});
