import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { Public } from '../auth/public.decorator';
import { CreateSupportTicketDto, ReplySupportTicketDto, UpdateSupportTicketDto } from './support.dto';
import { AdminRoute } from '../auth/admin-route.decorator';
import { AuthenticatedStaff, StaffJwtGuard } from '../staff/staff-jwt.guard';
import { SupportService } from './support.service';
@ApiTags('Customer Support')
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}
  @Post('tickets')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('support.tickets.create')
  @ApiOperation({ summary: 'Customer: create a support or dispute ticket' })
  create(@CurrentUser('id') id: number, @Body() dto: CreateSupportTicketDto) {
    return this.support.create(id, dto);
  }
  @Get('tickets')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('support.tickets.view.own')
  @ApiOperation({ summary: 'Customer: list own support tickets' })
  list(@CurrentUser('id') id: number) {
    return this.support.list(id);
  }
  @Get('tickets/:id')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('support.tickets.view.own')
  @ApiOperation({ summary: 'Customer: get own support ticket and replies' })
  one(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.support.one(userId, id);
  }
  @Post('tickets/:id/replies')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('support.tickets.view.own')
  @ApiOperation({ summary: 'Customer: reply in an open support conversation' })
  reply(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplySupportTicketDto,
  ) {
    return this.support.reply(userId, id, dto.body);
  }
  @Public() @Get('faqs') @ApiOperation({ summary: 'Public: list published support FAQs' }) faqs(
    @Query('category') category?: string,
  ) {
    return this.support.faqs(category);
  }
}

@ApiTags('Support administration')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard)
@Controller('admin/support')
export class SupportAdminController {
  constructor(private readonly support: SupportService) {}
  private authorize(staff: AuthenticatedStaff) {
    if (!['SUPER_ADMIN', 'CUSTOMER_SUPPORT_ADMIN', 'OPERATIONS_ADMIN'].includes(staff.role))
      throw new ForbiddenException('Staff role cannot manage support tickets.');
  }
  @Get('tickets')
  @ApiOperation({ summary: 'Support/Operations: list customer support and dispute tickets' })
  list(@Req() req: { staffUser: AuthenticatedStaff }, @Query('status') status?: string) {
    this.authorize(req.staffUser);
    return this.support.adminTickets(status);
  }
  @Patch('tickets/:id')
  @ApiOperation({ summary: 'Support/Operations: update ticket status and priority' })
  update(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupportTicketDto,
  ) {
    this.authorize(req.staffUser);
    return this.support.updateTicket(id, dto);
  }
  @Post('tickets/:id/replies')
  @ApiOperation({ summary: 'Support/Operations: reply to a customer support conversation' })
  reply(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReplySupportTicketDto,
  ) {
    this.authorize(req.staffUser);
    return this.support.adminReply(id, dto.body);
  }
}
