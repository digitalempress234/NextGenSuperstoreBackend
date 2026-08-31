import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { randomUUID } from 'node:crypto';

import { RequestContextService } from './request-context.service';
import { AppLoggerService } from './app-logger.service';

@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  constructor(
    private readonly context: RequestContextService,
    private readonly logger: AppLoggerService,
  ) {}

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    const http = executionContext.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const requestId =
      (req.headers['x-request-id'] as string | undefined) ??
      randomUUID();

    const requestContext = {
      requestId,
      method: req.method,
      path: req.originalUrl ?? req.url,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };

    res.setHeader('x-request-id', requestId);

    return new Observable((subscriber) => {
      this.context.run(requestContext, () => {
        const startedAt = Date.now();

        this.logger.info('request.started', {
          eventType: 'http',
          event: 'request.started',
        });

        next.handle().pipe(
          tap({
            next: () => {
              this.logger.info('request.completed', {
                eventType: 'http',
                event: 'request.completed',
                statusCode: res.statusCode,
                durationMs: Date.now() - startedAt,
              });
            },
            error: (error: unknown) => {
              this.logger.error(
                'request.failed',
                error instanceof Error ? error.stack : undefined,
                'HTTP',
              );
              this.logger.info('request.failed.metrics', {
                eventType: 'http',
                event: 'request.failed',
                statusCode: res.statusCode,
                durationMs: Date.now() - startedAt,
              });
            },
          }),
        ).subscribe(subscriber);
      });
    });
  }
}
