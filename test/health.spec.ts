import { ServiceUnavailableException } from '@nestjs/common';

import { HealthController } from '../src/health/health.controller';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { RedisService } from '../src/redis/redis.service';

describe('HealthController', () => {
  function controller(database: Promise<unknown>, redisPing: Promise<unknown>) {
    const prisma = { $queryRaw: jest.fn(() => database) } as unknown as PrismaService;
    const redis = { client: { ping: jest.fn(() => redisPing) } } as unknown as RedisService;
    return new HealthController(prisma, redis);
  }

  it('reports healthy required dependencies', async () => {
    await expect(
      controller(Promise.resolve(1), Promise.resolve('PONG')).check(),
    ).resolves.toMatchObject({
      status: 'ok',
      service: 'purse-api',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('returns service unavailable when a required dependency is down', async () => {
    const request = controller(
      Promise.reject(new Error('database unavailable')),
      Promise.resolve('PONG'),
    ).check();
    await expect(request).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(request).rejects.toMatchObject({
      response: {
        status: 'error',
        checks: { database: 'down', redis: 'up' },
      },
    });
  });
});
