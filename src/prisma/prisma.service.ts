import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

import { AppLoggerService } from '../logging/app-logger.service';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private readonly logger: AppLoggerService) {
    super({
      log:
        process.env.PRISMA_QUERY_LOGS === 'true'
          ? [
              { level: 'query', emit: 'event' },
              { level: 'error', emit: 'event' },
              { level: 'warn', emit: 'event' },
            ]
          : [
              { level: 'error', emit: 'event' },
              { level: 'warn', emit: 'event' },
            ],
    });

    (this as any).$on('error', (event: any) => {
      this.logger.error('prisma.error', event.message, 'Prisma');
    });

    (this as any).$on('warn', (event: any) => {
      this.logger.warn(
        {
          event: 'prisma.warn',
          message: event.message,
        },
        'Prisma',
      );
    });

    if (process.env.PRISMA_QUERY_LOGS === 'true') {
      (this as any).$on('query', (event: any) => {
        this.logger.debug(
          {
            event: 'prisma.query',
            durationMs: event.duration,
            target: event.target,
          },
          'Prisma',
        );
      });
    }
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.info('database.connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.info('database.disconnected');
  }
}
