import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';

import { IS_PUBLIC_KEY } from '../auth/public.decorator';
import { StaffService, getStaffPermissions } from './staff.service';

export interface AuthenticatedStaff {
  id: number;
  email: string;
  role: string;
  permissions: string[];
  sessionId: number;
  mustChangePassword: boolean;
}

@Injectable()
export class StaffJwtGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly staffService: StaffService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = request.cookies?.purse_staff_token as string | undefined;

    if (!token) {
      throw new UnauthorizedException('Staff authentication cookie is missing.');
    }

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
        sid: number;
        type: string;
      }>(token, {
        secret: this.config.getOrThrow<string>('JWT_STAFF_SECRET'),
      });

      if (payload.type !== 'STAFF') {
        throw new UnauthorizedException('Invalid token type.');
      }

      const staff = await this.staffService.validateSession(payload.sub, payload.sid);

      request.staffUser = {
        id: staff.id,
        email: staff.email,
        role: staff.role,
        permissions: getStaffPermissions(staff.role),
        sessionId: payload.sid,
        mustChangePassword: staff.mustChangePassword,
      } satisfies AuthenticatedStaff;

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Invalid or expired staff token.');
    }
  }
}
