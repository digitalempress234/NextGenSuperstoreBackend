import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';

import { OkExample } from '../common/api-docs';

import { Public } from '../auth/public.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Check API, database, and Redis availability' })
  @OkExample(
    {
      status: 'ok',
      service: 'purse-api',
      checks: { database: 'up', redis: 'up' },
      timestamp: '2026-10-03T09:30:00.000Z',
    },
    'Health check passed',
  )
  @ApiServiceUnavailableResponse({
    description: 'The API is running, but at least one required dependency is unavailable.',
    schema: {
      example: {
        status: 'error',
        service: 'purse-api',
        checks: { database: 'down', redis: 'up' },
        timestamp: '2026-10-03T09:30:00.000Z',
      },
    },
  })
  async check() {
    const timestamp = new Date().toISOString();
    const [database, redis] = await Promise.allSettled([
      this.prisma.$queryRaw`SELECT 1`,
      this.redis.client.ping(),
    ]);
    const checks = {
      database: database.status === 'fulfilled' ? 'up' : 'down',
      redis: redis.status === 'fulfilled' ? 'up' : 'down',
    };

    if (database.status === 'rejected' || redis.status === 'rejected') {
      throw new ServiceUnavailableException({
        status: 'error',
        service: 'purse-api',
        checks,
        timestamp,
      });
    }

    return {
      status: 'ok',
      service: 'purse-api',
      checks,
      timestamp,
    };
  }
}
