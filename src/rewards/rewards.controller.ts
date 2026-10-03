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
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { ApplyVoucherDto, RedeemCashbackDto, SaveVoucherDto } from './dto/rewards.dto';
import { AdminRoute } from '../auth/admin-route.decorator';
import { AuthenticatedStaff, StaffJwtGuard } from '../staff/staff-jwt.guard';
import { RewardsService } from './rewards.service';
import { OkExample } from '../common/api-docs';
import { REWARD_SUMMARY_EXAMPLE, REWARD_VOUCHERS_EXAMPLE } from '../common/docs-examples';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Customer Rewards')
@ApiCookieAuth('purse_access_token')
@RequirePermissions('rewards.view')
@Controller('rewards')
export class RewardsController {
  constructor(private readonly rewards: RewardsService) {}
  @Get('summary')
  @ApiOperation({ summary: 'Customer: get reward balances and active voucher count' })
  @OkExample(REWARD_SUMMARY_EXAMPLE, 'Customer rewards summary')
  summary(@CurrentUser('id') id: number) {
    return this.rewards.summary(id);
  }
  @Get('cashback')
  @ApiOperation({ summary: 'Customer: list cashback history' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  cashback(
    @CurrentUser('id') id: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 15,
  ) {
    return this.rewards.cashback(id, page, Math.min(limit, 100));
  }
  @Post('cashback/redeem')
  @RequirePermissions('rewards.redeem')
  @ApiOperation({ summary: 'Customer: redeem available cashback into wallet' })
  redeem(@CurrentUser('id') id: number, @Body() dto: RedeemCashbackDto) {
    return this.rewards.redeem(id, dto.amount);
  }
  @Get('vouchers')
  @ApiOperation({ summary: 'Customer: list available and owned vouchers' })
  @OkExample(REWARD_VOUCHERS_EXAMPLE, 'Paginated available and owned vouchers')
  vouchers(@CurrentUser('id') id: number, @Query() query: PaginationDto) {
    return this.rewards.vouchers(id, query.page, query.limit);
  }
  @Post('vouchers/:id/claim')
  @RequirePermissions('rewards.redeem')
  @ApiOperation({ summary: 'Customer: claim a reward voucher' })
  claim(@CurrentUser('id') userId: number, @Param('id') id: string) {
    return this.rewards.claim(userId, id);
  }
  @Post('vouchers/apply')
  @RequirePermissions('cart.manage')
  @ApiOperation({ summary: 'Customer: apply a claimed voucher to the active cart' })
  apply(@CurrentUser('id') id: number, @Body() dto: ApplyVoucherDto) {
    return this.rewards.apply(id, dto.voucher);
  }
}

@ApiTags('Rewards administration')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard)
@Controller('admin/rewards')
export class RewardsAdminController {
  constructor(private readonly rewards: RewardsService) {}
  private authorize(staff: AuthenticatedStaff) {
    if (!['SUPER_ADMIN', 'OPERATIONS_ADMIN', 'FINANCE_ADMIN'].includes(staff.role))
      throw new ForbiddenException('Staff role cannot manage rewards.');
  }
  @Get('vouchers')
  @ApiOperation({ summary: 'Operations/Finance: list every voucher campaign' })
  list(@Req() req: { staffUser: AuthenticatedStaff }) {
    this.authorize(req.staffUser);
    return this.rewards.adminVouchers();
  }
  @Post('vouchers')
  @ApiOperation({ summary: 'Operations/Finance: create a voucher campaign' })
  create(@Req() req: { staffUser: AuthenticatedStaff }, @Body() dto: SaveVoucherDto) {
    this.authorize(req.staffUser);
    return this.rewards.saveVoucher(dto);
  }
  @Patch('vouchers/:id')
  @ApiOperation({ summary: 'Operations/Finance: update or deactivate a voucher campaign' })
  update(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id') id: string,
    @Body() dto: SaveVoucherDto,
  ) {
    this.authorize(req.staffUser);
    return this.rewards.saveVoucher(dto, id);
  }
}
