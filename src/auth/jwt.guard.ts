import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { PrismaService } from '../prisma/prisma.service';
import { RbacService } from '../rbac/rbac.service';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly rbac: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.purse_access_token as string | undefined;

    if (!token) {
      throw new UnauthorizedException('Authentication cookie is missing.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: number; sid?: number }>(token, {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      });

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: { id: true, email: true, status: true },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException('Account is not active.');
      }

      if (payload.sid) {
        const session = await this.prisma.adminSession.findUnique({
          where: { id: payload.sid },
        });

        if (
          session &&
          (session.revokedAt || session.expiresAt <= new Date())
        ) {
          throw new UnauthorizedException('Session has expired or been revoked.');
        }

        if (session) {
          await this.prisma.adminSession.update({
            where: { id: session.id },
            data: { lastSeenAt: new Date() },
          });
        }
      }

      request.user = {
        ...(await this.rbac.buildUserContext(user.id)),
        sessionId: payload.sid,
      };
      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }
}
