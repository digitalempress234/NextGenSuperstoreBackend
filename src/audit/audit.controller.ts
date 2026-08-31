import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { AuditService } from './audit.service';

@ApiTags('Audit')
@ApiCookieAuth('purse_access_token')
@Controller('audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get('logs')
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'List append-only privileged action audit records' })
  @ApiQuery({ name: 'limit', required: false, example: 100 })
  @OkExample([
    {
      id: 1,
      action: 'ROLE_ASSIGNED',
      permission: 'roles.assign',
      entity: 'UserRole',
      entityId: '101:7',
      success: true,
      createdAt: '2026-08-25T17:00:00.000Z',
    },
  ])
  @StandardErrors()
  list(@Query('limit') limit = '100') {
    return this.audit.list(Number(limit));
  }
}
