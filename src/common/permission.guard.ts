import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { REQUIRED_PERMISSIONS } from './permissions.decorator';
import { REQUIRED_ROLES } from './decorators/roles.decorator';
import { AuthenticatedUser } from './types';
import { RbacService } from '../rbac/rbac.service';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbac: RbacService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ROLES,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions?.length && !requiredRoles?.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authenticated user context is required.');
    }

    if (requiredRoles?.length) {
      const roleAllowed = requiredRoles.some((role) => user.roles.includes(role));
      if (!roleAllowed) {
        throw new ForbiddenException('Required role is missing.');
      }
    }

    if (requiredPermissions?.length) {
      const permissionAllowed = requiredPermissions.every((permission) =>
        this.rbac.hasPermission(user, permission),
      );

      if (!permissionAllowed) {
        throw new ForbiddenException('Required permission is missing.');
      }
    }

    return true;
  }
}
