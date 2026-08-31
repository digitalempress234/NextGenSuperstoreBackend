import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { CreateApprovalRequestDto, DecideApprovalDto } from '../rbac/dto/rbac.dto';
import { ApprovalsService } from './approvals.service';

@ApiTags('Approvals')
@ApiCookieAuth('purse_access_token')
@Controller('approvals')
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post()
  @RequirePermissions('orders.refund.initiate')
  @ApiOperation({ summary: 'Create an approval request for a sensitive action' })
  @OkExample({
    id: 9001,
    actionKey: 'orders.refund.approve',
    resourceType: 'ORDER',
    resourceId: '9812',
    status: 'PENDING',
  })
  @StandardErrors()
  create(@CurrentUser('id') actorId: number, @Body() dto: CreateApprovalRequestDto) {
    return this.approvals.create(actorId, dto);
  }

  @Get('pending')
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'List pending approval requests' })
  @OkExample([
    {
      id: 9001,
      actionKey: 'orders.refund.approve',
      resourceType: 'ORDER',
      resourceId: '9812',
      status: 'PENDING',
    },
  ])
  @StandardErrors()
  listPending() {
    return this.approvals.listPending();
  }

  @Post(':id/decision')
  @RequirePermissions('orders.refund.approve')
  @ApiOperation({ summary: 'Approve or reject a sensitive approval request' })
  @ApiParam({ name: 'id', example: 9001 })
  @OkExample({ id: 9001, status: 'APPROVED', decidedAt: '2026-08-25T17:30:00.000Z' })
  @StandardErrors()
  decide(
    @CurrentUser('id') actorId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: DecideApprovalDto,
  ) {
    return this.approvals.decide(actorId, id, dto);
  }
}
