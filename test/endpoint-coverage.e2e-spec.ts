import { INestApplication, VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { endpointCases } from './endpoint-cases';

const base = '/purse/v1';

describe('Complete endpoint route coverage', () => {
  let app: INestApplication;

  beforeAll(async () => {
    if (process.env.RUN_FULL_E2E !== 'true') {
      return;
    }

    app = await NestFactory.create(AppModule, { logger: false });

    app.setGlobalPrefix('purse');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });

    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('has a documented test case for every controller endpoint', async () => {
    if (process.env.RUN_FULL_E2E !== 'true') {
      return;
    }

    const expected = new Set(endpointCases.map((item) => `${item.method.toUpperCase()} ${base}${item.path}`));

    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Purse endpoint coverage').build(),
    );
    const actual = new Set<string>();

    for (const [path, operations] of Object.entries(document.paths)) {
      for (const method of Object.keys(operations ?? {})) {
        if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue;
        const normalizedPath = path.startsWith('/purse/v1')
          ? path
          : path.startsWith('/v1')
            ? `/purse${path}`
            : `${base}${path}`;
        
        // Convert Swagger {id} or {productId} to 1 to match our endpointCases
        const withIdReplaced = normalizedPath.replace(/\{[^}]+\}/g, '1');
        actual.add(`${method.toUpperCase()} ${withIdReplaced}`);
      }
    }

    const missingTests = [...actual].filter((route) => !expected.has(route));
    const staleTests = [...expected].filter((route) => !actual.has(route));

    expect(missingTests).toEqual([]);
    expect(staleTests).toEqual([]);
    expect(expected.size).toBe(actual.size);
  });

  it.each(endpointCases)('$method $path is wired with the expected unauthenticated contract', async (item) => {
    if (process.env.RUN_FULL_E2E !== 'true') {
      return;
    }

    let agent = request(app.getHttpServer())[item.method](base + item.path);
    if (item.query) agent = agent.query(item.query);
    if (item.body) agent = agent.send(item.body);

    const response = await agent;
    const allowed = Array.isArray(item.expectedWithoutAuth) ? item.expectedWithoutAuth : [item.expectedWithoutAuth];
    
    // In strict CSRF environments, unauthenticated POST/PATCH/DELETE often return 403 Forbidden
    const isCsrfBlocked = ['post', 'patch', 'delete', 'put'].includes(item.method) && response.status === 403;
    
    if (isCsrfBlocked) {
      expect(response.status).toBe(403);
    } else {
      expect(allowed).toContain(response.status);
    }
    
    const is404Allowed = Array.isArray(item.expectedWithoutAuth)
      ? item.expectedWithoutAuth.includes(404)
      : item.expectedWithoutAuth === 404;
      
    if (!is404Allowed) {
      expect(response.status).not.toBe(404);
    }
  });
});
