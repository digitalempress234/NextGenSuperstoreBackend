import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

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
  @OkExample({ status: 'ok', service: 'purse-api', timestamp: '2026-08-27T00:00:00.000Z' }, 'Health check passed')
  async check() {
    await this.prisma.$queryRaw`SELECT 1`;
    await this.redis.client.ping();

    return {
      status: 'ok',
      service: 'purse-api',
      timestamp: new Date().toISOString(),
    };
  }
}
