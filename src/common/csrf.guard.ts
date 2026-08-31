import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

import { SKIP_CSRF_KEY } from './skip-csrf.decorator';

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const skipCsrf = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skipCsrf) {
      return true;
    }
    const method = request.method.toUpperCase();

    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    const origin = request.headers.origin as string | undefined;
    const referer = request.headers.referer as string | undefined;
    const candidate = origin ?? this.extractOrigin(referer);
    const allowedOrigins = (this.config.get<string>('CORS_ORIGIN') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!candidate || !allowedOrigins.includes(candidate)) {
      throw new ForbiddenException('CSRF origin validation failed.');
    }

    return true;
  }

  private extractOrigin(referer?: string): string | undefined {
    if (!referer) {
      return undefined;
    }

    try {
      return new URL(referer).origin;
    } catch {
      return undefined;
    }
  }
}
