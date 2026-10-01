import { Controller, Get, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { ReferralsService } from './referrals.service';

@ApiTags('Customer Referrals')
@ApiCookieAuth('purse_access_token')
@RequirePermissions('referrals.view')
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}
  @Get('me')
  @ApiOperation({ summary: 'Customer: get referral code, progress, and earned discounts' })
  me(@CurrentUser('id') id: number) {
    return this.referrals.me(id);
  }
  @Post('claim')
  @RequirePermissions('referrals.claim')
  @ApiOperation({ summary: 'Customer: claim qualified referral rewards into wallet' })
  claim(@CurrentUser('id') id: number) {
    return this.referrals.claim(id);
  }
}
