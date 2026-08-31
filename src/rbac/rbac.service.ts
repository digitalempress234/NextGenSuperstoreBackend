import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RoleName } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { AuthenticatedUser } from '../common/types';
import { AssignRoleDto, PermissionOverrideDto } from './dto/rbac.dto';

@Injectable()
export class RbacService {
  constructor(private readonly prisma: PrismaService) {}

  async buildUserContext(userId: number): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        permissionOverrides: {
          where: {
            startsAt: { lte: new Date() },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          include: { permission: true },
        },
        merchantScopes: true,
        regionScopes: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const rolePermissions = user.roles.flatMap((assignment) =>
      assignment.role.permissions.map((entry) => entry.permission.key),
    );

    const grantedOverrides = user.permissionOverrides
      .filter((override) => override.granted)
      .map((override) => override.permission.key);

    const deniedOverrides = new Set(
      user.permissionOverrides
        .filter((override) => !override.granted)
        .map((override) => override.permission.key),
    );

    const permissions = [...new Set([...rolePermissions, ...grantedOverrides])]
      .filter((permission) => !deniedOverrides.has(permission));

    return {
      id: user.id,
      email: user.email,
      roles: user.roles.map((entry) => entry.role.name),
      permissions,
      merchantScopeIds: user.merchantScopes.map((scope) => scope.storeId),
      regionScopes: user.regionScopes.map((scope) => ({
        country: scope.country,
        state: scope.state,
        city: scope.city ?? undefined,
      })),
    };
  }

  hasPermission(user: AuthenticatedUser, required: string): boolean {
    if (user.permissions.includes(required)) {
      return true;
    }

    const [domain] = required.split('.');
    return user.permissions.includes(`${domain}.*`) || user.permissions.includes('admin.*');
  }

  assertPermission(user: AuthenticatedUser, required: string): void {
    if (!this.hasPermission(user, required)) {
      throw new ForbiddenException(`Missing permission: ${required}`);
    }
  }

  async listRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { users: true } },
      },
      orderBy: { level: 'desc' },
    });
  }

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async assignRole(actorId: number, dto: AssignRoleDto) {
    const roleName = dto.roleName as RoleName;
    const role = await this.prisma.role.findUnique({ where: { name: roleName } });

    if (!role) {
      throw new NotFoundException(`Role ${dto.roleName} does not exist.`);
    }

    if (dto.userId === actorId && role.level >= 80) {
      throw new ForbiddenException('Self-assignment of privileged roles is not allowed.');
    }

    const assignment = await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId: dto.userId,
          roleId: role.id,
        },
      },
      update: {
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      create: {
        userId: dto.userId,
        roleId: role.id,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      include: { role: true, user: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ROLE_ASSIGNED',
        permission: 'roles.assign',
        entity: 'UserRole',
        entityId: `${dto.userId}:${role.id}`,
        changes: {
          userId: dto.userId,
          role: role.name,
          expiresAt: dto.expiresAt ?? null,
        },
      },
    });

    return assignment;
  }

  async revokeRole(actorId: number, userId: number, roleName: string) {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName as RoleName },
    });

    if (!role) {
      throw new NotFoundException('Role not found.');
    }

    await this.prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId: role.id,
        },
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'ROLE_REVOKED',
        permission: 'roles.revoke',
        entity: 'UserRole',
        entityId: `${userId}:${role.id}`,
        changes: { userId, role: role.name },
      },
    });

    return { userId, role: role.name, revoked: true };
  }

  async createOverride(actorId: number, dto: PermissionOverrideDto) {
    const permission = await this.prisma.permission.findUnique({
      where: { key: dto.permissionKey },
    });

    if (!permission) {
      throw new NotFoundException(`Permission ${dto.permissionKey} does not exist.`);
    }

    const override = await this.prisma.permissionOverride.create({
      data: {
        userId: dto.userId,
        permissionId: permission.id,
        granted: dto.granted,
        reason: dto.reason,
        scopeType: dto.scopeType,
        scopeId: dto.scopeId,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
      include: { permission: true, user: true },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId,
        action: 'PERMISSION_OVERRIDE_CREATED',
        permission: 'roles.override',
        entity: 'PermissionOverride',
        entityId: String(override.id),
        changes: {
          userId: dto.userId,
          permission: dto.permissionKey,
          granted: dto.granted,
          scopeType: dto.scopeType,
          scopeId: dto.scopeId,
          expiresAt: dto.expiresAt ?? null,
        },
      },
    });

    return override;
  }
}
