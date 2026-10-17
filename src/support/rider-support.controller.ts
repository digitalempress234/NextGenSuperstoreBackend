import { Body, Controller, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { RequirePermissions } from '../common/permissions.decorator';
import { RequireRoles } from '../common/decorators/roles.decorator';
import { CreateRiderSupportTicketDto } from './dto/support.dto';
import { SupportService } from './support.service';

@ApiTags('Rider Support')
@ApiCookieAuth('purse_access_token')
@RequireRoles('RIDER')
@Controller('riders/support')
export class RiderSupportController {
  constructor(private readonly support: SupportService) {}

  @Post('tickets')
  @RequirePermissions('support.tickets.create')
  @ApiOperation({
    summary: 'Rider: report an issue with an assigned delivery',
    description:
      'Creates a support ticket only when the delivery belongs to the authenticated rider. The related order and delivery are attached automatically for support staff.',
  })
  @OkExample({
    ticketId: 'SUP-1791900000000-A1B2C3',
    id: 1092,
    deliveryId: 33,
    status: 'OPEN',
    createdAt: '2026-10-13T12:00:00.000Z',
  })
  @StandardErrors()
  create(@CurrentUser('id') userId: number, @Body() dto: CreateRiderSupportTicketDto) {
    return this.support.createRiderTicket(userId, dto);
  }
}
