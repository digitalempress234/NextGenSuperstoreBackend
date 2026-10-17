import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AdminRoute } from '../auth/admin-route.decorator';
import { AuthenticatedStaff, StaffJwtGuard } from '../staff/staff-jwt.guard';
import { AdminService } from './admin.service';
import { OkExample } from '../common/api-docs';
import {
  ADMIN_CAMPAIGN_EXAMPLE,
  ADMIN_CAMPAIGNS_EXAMPLE,
  ADMIN_CUSTOMER_EXAMPLE,
  ADMIN_CUSTOMERS_EXAMPLE,
  ADMIN_ORDER_EXAMPLE,
  ADMIN_ORDERS_EXAMPLE,
  ADMIN_PAYOUT_EXAMPLE,
  ADMIN_PAYOUTS_EXAMPLE,
  ADMIN_RIDER_EXAMPLE,
  ADMIN_RIDERS_EXAMPLE,
  ADMIN_STORE_EXAMPLE,
  ADMIN_STORES_EXAMPLE,
  ADMIN_VENDOR_EXAMPLE,
  ADMIN_VENDORS_EXAMPLE,
} from '../common/docs-examples';
import { ResolveRefundAttentionDto } from './dto/admin.dto';
import { CompleteKlumpRefundDto } from '../bnpl/dto/klump.dto';

@ApiTags('Admin directories')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard)
@Controller('admin')
export class AdminListingsController {
  constructor(private readonly admin: AdminService) {}

  private authorize(staff: AuthenticatedStaff) {
    if (staff.role !== 'SUPER_ADMIN')
      throw new ForbiddenException('SUPER_ADMIN access is required.');
  }
  private paging(page?: string, limit?: string) {
    return {
      page: Math.max(1, Number(page) || 1),
      limit: Math.min(15, Math.max(1, Number(limit) || 15)),
    };
  }
  private check(req: { staffUser: AuthenticatedStaff }) {
    this.authorize(req.staffUser);
  }

  @Get('customers')
  @ApiOperation({ summary: 'Superadmin: list customers' })
  @OkExample(ADMIN_CUSTOMERS_EXAMPLE, 'Paginated customer directory')
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  customers(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    this.check(req);
    return this.admin.customers(this.paging(page, limit), search, status);
  }

  @Get('customers/:id')
  @ApiOperation({ summary: 'Superadmin: get customer detail' })
  @OkExample(ADMIN_CUSTOMER_EXAMPLE, 'Customer detail')
  customer(@Req() req: { staffUser: AuthenticatedStaff }, @Param('id', ParseIntPipe) id: number) {
    this.check(req);
    return this.admin.customer(id);
  }

  @Get('orders')
  @ApiOperation({ summary: 'Superadmin: list all orders' })
  @OkExample(ADMIN_ORDERS_EXAMPLE, 'Paginated order directory')
  orders(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    this.check(req);
    return this.admin.orders(this.paging(page, limit), status);
  }

  @Get('orders/:id')
  @ApiOperation({ summary: 'Superadmin: get order detail' })
  @OkExample(ADMIN_ORDER_EXAMPLE, 'Order detail')
  order(@Req() req: { staffUser: AuthenticatedStaff }, @Param('id', ParseIntPipe) id: number) {
    this.check(req);
    return this.admin.order(id);
  }

  @Get('payouts')
  @ApiOperation({ summary: 'Superadmin: list customer, store, and rider payouts' })
  @OkExample(ADMIN_PAYOUTS_EXAMPLE, 'Paginated payout directory')
  payouts(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    this.check(req);
    return this.admin.payouts(this.paging(page, limit), status);
  }

  @Get('payouts/:source/:id')
  @ApiOperation({ summary: 'Superadmin: get payout detail' })
  @OkExample(ADMIN_PAYOUT_EXAMPLE, 'Payout detail')
  payout(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('source') source: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.check(req);
    return this.admin.payout(source, id);
  }

  @Get('refunds')
  @ApiOperation({ summary: 'Superadmin: list order refunds' })
  refunds(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    this.check(req);
    return this.admin.refunds(this.paging(page, limit), status);
  }

  @Get('refunds/:id')
  @ApiOperation({ summary: 'Superadmin: get refund detail' })
  refund(@Req() req: { staffUser: AuthenticatedStaff }, @Param('id', ParseIntPipe) id: number) {
    this.check(req);
    return this.admin.refund(id);
  }

  @Post('refunds/:id/retry')
  @ApiOperation({ summary: 'Superadmin: retry a failed order refund' })
  retryRefund(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
  ) {
    this.check(req);
    return this.admin.retryRefund(id);
  }

  @Post('refunds/:id/resolve-attention')
  @ApiOperation({
    summary: 'Superadmin: provide customer-approved bank details for a Paystack refund',
  })
  resolveRefundAttention(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveRefundAttentionDto,
  ) {
    this.check(req);
    return this.admin.resolveRefundAttention(id, dto);
  }

  @Post('refunds/:id/complete-manual')
  @ApiOperation({
    summary: 'Superadmin: record completion of a Klump refund',
    description:
      'Complete the refund in the Klump merchant dashboard first, then record its provider reference here. Klump refund API documentation is not currently available.',
  })
  @OkExample({
    id: 12,
    provider: 'KLUMP',
    status: 'SUCCEEDED',
    providerRefundId: 'KLP-REFUND-12345',
  })
  completeManualRefund(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CompleteKlumpRefundDto,
  ) {
    this.check(req);
    return this.admin.completeManualRefund(id, dto.providerReference, req.staffUser.id);
  }

  @Get('stores')
  @ApiOperation({ summary: 'Superadmin: list stores' })
  @OkExample(ADMIN_STORES_EXAMPLE, 'Paginated store directory')
  stores(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('active') active?: string,
  ) {
    this.check(req);
    return this.admin.stores(this.paging(page, limit), active);
  }

  @Get('stores/:id')
  @ApiOperation({ summary: 'Superadmin: get store detail' })
  @OkExample(ADMIN_STORE_EXAMPLE, 'Store detail')
  store(@Req() req: { staffUser: AuthenticatedStaff }, @Param('id', ParseIntPipe) id: number) {
    this.check(req);
    return this.admin.store(id);
  }

  @Get('riders')
  @ApiOperation({ summary: 'Superadmin: list riders' })
  @OkExample(ADMIN_RIDERS_EXAMPLE, 'Paginated rider directory')
  riders(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    this.check(req);
    return this.admin.riders(this.paging(page, limit), status);
  }

  @Get('riders/:id')
  @ApiOperation({ summary: 'Superadmin: get rider detail' })
  @OkExample(ADMIN_RIDER_EXAMPLE, 'Rider detail')
  rider(@Req() req: { staffUser: AuthenticatedStaff }, @Param('id', ParseIntPipe) id: number) {
    this.check(req);
    return this.admin.rider(id);
  }

  @Get('vendors')
  @ApiOperation({ summary: 'Superadmin: list vendors' })
  @OkExample(ADMIN_VENDORS_EXAMPLE, 'Paginated vendor directory')
  vendors(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    this.check(req);
    return this.admin.vendors(this.paging(page, limit), status);
  }

  @Get('vendors/:userId')
  @ApiOperation({ summary: 'Superadmin: get vendor detail' })
  @OkExample(ADMIN_VENDOR_EXAMPLE, 'Vendor detail')
  vendor(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('userId', ParseIntPipe) userId: number,
  ) {
    this.check(req);
    return this.admin.vendor(userId);
  }

  @Get('campaigns')
  @ApiOperation({ summary: 'Superadmin: list platform and store campaigns' })
  @OkExample(ADMIN_CAMPAIGNS_EXAMPLE, 'Paginated campaign directory')
  campaigns(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('active') active?: string,
  ) {
    this.check(req);
    return this.admin.campaigns(this.paging(page, limit), active);
  }

  @Get('campaigns/:id')
  @ApiOperation({ summary: 'Superadmin: get campaign detail' })
  @OkExample(ADMIN_CAMPAIGN_EXAMPLE, 'Campaign detail')
  campaign(@Req() req: { staffUser: AuthenticatedStaff }, @Param('id') id: string) {
    this.check(req);
    return this.admin.campaign(id);
  }
}
