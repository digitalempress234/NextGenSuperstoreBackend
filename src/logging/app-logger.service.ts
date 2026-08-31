import { Injectable, LoggerService } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

import { RequestContextService } from './request-context.service';

type LogContext = Record<string, unknown> | undefined;

@Injectable()
export class AppLoggerService implements LoggerService {
  constructor(
    private readonly logger: PinoLogger,
    private readonly requestContext: RequestContextService,
  ) {}

  log(message: unknown, context?: string): void {
    this.logger.info(this.enrich(context), this.toMessage(message));
  }

  error(message: unknown, trace?: string, context?: string): void {
    this.logger.error(
      {
        ...this.enrich(context),
        err: trace ? { stack: trace } : undefined,
      },
      this.toMessage(message),
    );
  }

  warn(message: unknown, context?: string): void {
    this.logger.warn(this.enrich(context), this.toMessage(message));
  }

  debug(message: unknown, context?: string): void {
    this.logger.debug(this.enrich(context), this.toMessage(message));
  }

  verbose(message: unknown, context?: string): void {
    this.logger.trace(this.enrich(context), this.toMessage(message));
  }

  info(message: string, data?: LogContext): void {
    this.logger.info(
      {
        ...this.enrich(),
        ...(data ?? {}),
      },
      message,
    );
  }

  business(event: string, data?: LogContext): void {
    this.logger.info(
      {
        ...this.enrich(),
        eventType: 'business',
        event,
        ...(data ?? {}),
      },
      event,
    );
  }

  security(event: string, data?: LogContext): void {
    this.logger.warn(
      {
        ...this.enrich(),
        eventType: 'security',
        event,
        ...(data ?? {}),
      },
      event,
    );
  }

  otp(event: string, data: LogContext & { code?: string }): void {
    if (process.env.LOG_OTP_CODES === 'false') {
      const { code: _code, ...safeData } = data ?? {};

      this.logger.info(
        {
          ...this.enrich(),
          eventType: 'otp',
          event,
          ...safeData,
        },
        event,
      );

      return;
    }

    this.logger.info(
      {
        ...this.enrich(),
        eventType: 'otp',
        event,
        ...(data ?? {}),
      },
      event,
    );
  }

  private enrich(context?: string): Record<string, unknown> {
    const request = this.requestContext.get();

    return {
      context,
      requestId: request?.requestId,
      userId: request?.userId,
      path: request?.path,
      method: request?.method,
      ip: request?.ip,
    };
  }

  private toMessage(value: unknown): string {
    if (value instanceof Error) {
      return value.message;
    }

    if (typeof value === 'string') {
      return value;
    }

    return JSON.stringify(value);
  }
}
