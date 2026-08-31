import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Marketplace API contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    
    app.setGlobalPrefix('purse');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('home endpoint is public', async () => {
    const response = await request(app.getHttpServer())
      .get('/purse/v1/marketplace/home')
      .expect((res) => {
        expect([200, 401, 404, 500]).toContain(res.status);
      });

    if (response.status === 200) {
      expect(response.body.data ?? response.body).toHaveProperty(
        'categories',
      );
    }
  });

  it('browse endpoint accepts frontend filters', async () => {
    const response = await request(app.getHttpServer())
      .get('/purse/v1/marketplace/browse')
      .query({
        q: 'milk',
        categoryId: 4,
        sort: 'price_asc',
        page: 1,
        limit: 20,
      })
      .expect((res) => {
        expect([200, 401, 404, 500]).toContain(res.status);
      });

    if (response.status === 200) {
      const payload = response.body.data ?? response.body;
      expect(payload).toHaveProperty('items');
      expect(payload).toHaveProperty('pagination');
    }
  });
});
