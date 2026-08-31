import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { RbacService } from './rbac.service';
import {
  AssignRoleDto,
  PermissionOverrideDto,
} from './dto/rbac.dto';

@ApiTags('RBAC')
@ApiCookieAuth('purse_access_token')
@Controller('rbac')
export class RbacController {
  constructor(private readonly rbac: RbacService) {}

  @Get('roles')
  @RequirePermissions('roles.assign')
  @ApiOperation({ summary: 'List roles and their permissions' })
  @OkExample([
    {
      id: 1,
      name: 'FINANCE_ADMIN',
      level: 80,
      permissions: [
        { permission: { key: 'orders.refund.approve' } },
        { permission: { key: 'payments.reconcile' } },
      ],
    },
  ])
  @StandardErrors()
  listRoles() {
    return this.rbac.listRoles();
  }

  @Get('permissions')
  @RequirePermissions('roles.assign')
  @ApiOperation({ summary: 'List all granular permissions' })
  @OkExample([
    {
      id: 12,
      key: 'orders.refund.approve',
      description: 'Approve a refund workflow.',
    },
  ])
  @StandardErrors()
  listPermissions() {
    return this.rbac.listPermissions();
  }

  @Post('roles/assign')
  @RequirePermissions('roles.assign')
  @ApiOperation({ summary: 'Assign a role to a user' })
  @OkExample({ userId: 101, role: 'OPERATIONS_ADMIN', expiresAt: null })
  @StandardErrors()
  assignRole(
    @CurrentUser('id') actorId: number,
    @Body() dto: AssignRoleDto,
  ) {
    return this.rbac.assignRole(actorId, dto);
  }

  @Delete('roles/:userId/:roleName')
  @RequirePermissions('roles.revoke')
  @ApiOperation({ summary: 'Revoke a role from a user' })
  @ApiParam({ name: 'userId', example: 101 })
  @ApiParam({ name: 'roleName', example: 'OPERATIONS_ADMIN' })
  @OkExample({ userId: 101, role: 'OPERATIONS_ADMIN', revoked: true })
  @StandardErrors()
  revokeRole(
    @CurrentUser('id') actorId: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('roleName') roleName: string,
  ) {
    return this.rbac.revokeRole(actorId, userId, roleName);
  }

  @Post('permission-overrides')
  @RequirePermissions('roles.override')
  @ApiOperation({ summary: 'Create a temporary or scoped permission override' })
  @OkExample({
    id: 77,
    userId: 101,
    permission: { key: 'reports.export' },
    granted: true,
    scopeType: 'STORE',
    scopeId: '42',
    expiresAt: '2026-12-31T23:59:59.000Z',
  })
  @StandardErrors()
  createOverride(
    @CurrentUser('id') actorId: number,
    @Body() dto: PermissionOverrideDto,
  ) {
    return this.rbac.createOverride(actorId, dto);
  }
}
