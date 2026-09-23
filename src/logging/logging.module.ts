import { Global, Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { randomUUID } from 'node:crypto';

import { LOG_REDACT_PATHS, REQUEST_ID_HEADER } from './logging.constants';
import { AppLoggerService } from './app-logger.service';
import { RequestContextService } from './request-context.service';
import { RequestContextInterceptor } from './request-context.interceptor';

@Global()
@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        genReqId: (req) =>
          typeof req.headers[REQUEST_ID_HEADER] === 'string'
            ? req.headers[REQUEST_ID_HEADER]
            : randomUUID(),
        customProps: (req) => ({
          service: 'purse-api',
          environment: process.env.NODE_ENV ?? 'development',
          userAgent: req.headers['user-agent'],
        }),
        redact: {
          paths: LOG_REDACT_PATHS,
          censor: '[REDACTED]',
        },
        serializers: {
          req(request) {
            return {
              method: request.method,
              url: request.url,
              remoteAddress: request.remoteAddress,
              remotePort: request.remotePort,
              userAgent: request.headers['user-agent'],
            };
          },
          res(response) {
            return {
              statusCode: response.statusCode,
            };
          },
        },
        transport:
          process.env.NODE_ENV !== 'production' || process.env.PRETTY_LOGS === 'true'
            ? {
                target: 'pino-pretty',
                options: {
                  singleLine: false,
                  colorize: true,
                  translateTime: 'SYS:standard',
                },
              }
            : undefined,
      },
    }),
  ],
  providers: [RequestContextService, AppLoggerService, RequestContextInterceptor],
  exports: [RequestContextService, AppLoggerService, LoggerModule],
})
export class LoggingModule {}
