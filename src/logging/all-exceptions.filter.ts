import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response } from 'express';

import { AppLoggerService } from './app-logger.service';
import { RequestContextService } from './request-context.service';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: AppLoggerService,
    private readonly requestContext: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const errorName = exception instanceof Error ? exception.name : 'UnknownError';
    const details =
      typeof message === 'object' && message !== null
        ? (message as { message?: string | string[]; errors?: unknown; data?: unknown })
        : undefined;

    this.logger.error(
      {
        exception,
        errorName,
        status,
        requestId: this.requestContext.requestId,
      },
      exception instanceof Error ? exception.stack : undefined,
      'GlobalExceptionFilter',
    );

    response.status(status).json({
      success: false,
      error: {
        code: this.mapCode(status),
        message: typeof message === 'string' ? message : (details?.message ?? 'Request failed'),
        ...(details?.errors !== undefined ? { errors: details.errors } : {}),
        ...(details?.data !== undefined ? { data: details.data } : {}),
      },
      requestId: this.requestContext.requestId,
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url,
    });
  }

  private mapCode(status: number): string {
    switch (status) {
      case 400:
        return 'BAD_REQUEST';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'UNPROCESSABLE_ENTITY';
      case 429:
        return 'RATE_LIMITED';
      default:
        return 'INTERNAL_SERVER_ERROR';
    }
  }
}
