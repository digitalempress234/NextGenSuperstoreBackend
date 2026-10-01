import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRED_PERMISSIONS } from '../common/permissions.decorator';
import type { AuthenticatedStaff } from './staff-jwt.guard';

@Injectable()
export class StaffPermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(REQUIRED_PERMISSIONS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<{ staffUser?: AuthenticatedStaff }>();
    const granted = request.staffUser?.permissions ?? [];
    const allowed = required.every(
      (permission) =>
        granted.includes(permission) ||
        granted.includes('*') ||
        granted.includes('admin.*') ||
        granted.some((candidate) =>
          candidate.endsWith('.*') ? permission.startsWith(candidate.slice(0, -1)) : false,
        ),
    );
    if (!request.staffUser || !allowed) {
      throw new ForbiddenException('Required staff permission is missing.');
    }
    return true;
  }
}
