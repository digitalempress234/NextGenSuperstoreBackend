import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

import { AppLoggerService } from '../logging/app-logger.service';

@Injectable()
export class PrismaService extends PrismaClient<Prisma.PrismaClientOptions, 'query' | 'error' | 'warn'> implements OnModuleInit {
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

    this.$on('error', (event: Prisma.LogEvent) => {
      this.logger.error('prisma.error', event.message, 'Prisma');
    });

    this.$on('warn', (event: Prisma.LogEvent) => {
      this.logger.warn(
        {
          event: 'prisma.warn',
          message: event.message,
        },
        'Prisma',
      );
    });

    if (process.env.PRISMA_QUERY_LOGS === 'true') {
      this.$on('query', (event: Prisma.QueryEvent) => {
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
