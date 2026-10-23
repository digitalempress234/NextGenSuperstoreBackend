import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CreatedExample, OkExample, StandardErrors } from '../common/api-docs';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { PushCampaignsService } from '../notifications/push-campaigns.service';
import {
  CreateStorePushCampaignDto,
  ScheduleStorePushCampaignDto,
  StorePushCampaignListQueryDto,
  UpdateStorePushCampaignDto,
} from './dto/store-push-campaign.dto';

const STORE_PUSH_CAMPAIGN_EXAMPLE = {
  id: 21,
  storeId: 6,
  title: 'Campus weekend offer',
  message: 'Previous customers get free delivery this weekend.',
  audienceType: 'STORE_CUSTOMERS',
  approvalStatus: 'PENDING',
  status: 'DRAFT',
  includeInApp: true,
  totalRecipients: 0,
  deliveredCount: 0,
  failedCount: 0,
  skippedCount: 0,
};

@ApiTags('Store push campaigns')
@ApiCookieAuth('purse_access_token')
@RequirePermissions('stores.update')
@Controller('stores/:storeId/push-campaigns')
export class StorePushCampaignsController {
  constructor(private readonly campaigns: PushCampaignsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a store advertising campaign for admin review',
    description:
      'Only an approved store owner may create a campaign. The audience is fixed to active customers who previously ordered from this store; arbitrary users, riders, and other stores’ customers cannot be targeted.',
  })
  @CreatedExample(STORE_PUSH_CAMPAIGN_EXAMPLE, 'Vendor campaign created and awaiting review.')
  @StandardErrors()
  create(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: CreateStorePushCampaignDto,
  ) {
    return this.campaigns.createForStore(userId, storeId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List this store’s push campaigns' })
  @OkExample({
    items: [STORE_PUSH_CAMPAIGN_EXAMPLE],
    pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
  })
  @StandardErrors()
  list(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query() query: StorePushCampaignListQueryDto,
  ) {
    return this.campaigns.listForStore(userId, storeId, query);
  }

  @Get(':campaignId')
  @ApiOperation({ summary: 'Get one store push campaign and its delivery totals' })
  @ApiParam({ name: 'campaignId', example: 21 })
  @OkExample(STORE_PUSH_CAMPAIGN_EXAMPLE)
  @StandardErrors()
  get(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('campaignId', ParseIntPipe) campaignId: number,
  ) {
    return this.campaigns.getForStore(userId, storeId, campaignId);
  }

  @Patch(':campaignId')
  @ApiOperation({
    summary: 'Update a draft store campaign and resubmit it for review',
    description: 'Any edit resets approvalStatus to PENDING.',
  })
  @ApiParam({ name: 'campaignId', example: 21 })
  @OkExample(STORE_PUSH_CAMPAIGN_EXAMPLE)
  @StandardErrors()
  update(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('campaignId', ParseIntPipe) campaignId: number,
    @Body() dto: UpdateStorePushCampaignDto,
  ) {
    return this.campaigns.updateForStore(userId, storeId, campaignId, dto);
  }

  @Post(':campaignId/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Test a store campaign on the vendor’s own registered device',
    description: 'No customer can be selected for a vendor test send.',
  })
  @ApiParam({ name: 'campaignId', example: 21 })
  @OkExample({
    campaignId: 21,
    userId: 15,
    inAppDelivered: true,
    push: { enabled: true, attempted: 1, successful: 1, failed: 0 },
  })
  @StandardErrors()
  test(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('campaignId', ParseIntPipe) campaignId: number,
  ) {
    return this.campaigns.testForStore(userId, storeId, campaignId);
  }

  @Post(':campaignId/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Send an approved store campaign immediately',
    description:
      'The campaign must be admin-approved. A store may send at most three campaigns per day.',
  })
  @ApiParam({ name: 'campaignId', example: 21 })
  @OkExample({ ...STORE_PUSH_CAMPAIGN_EXAMPLE, approvalStatus: 'APPROVED', status: 'SENDING' })
  @StandardErrors()
  send(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('campaignId', ParseIntPipe) campaignId: number,
  ) {
    return this.campaigns.sendForStore(userId, storeId, campaignId);
  }

  @Post(':campaignId/schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Schedule an approved store campaign',
    description:
      'The campaign must be admin-approved. The three-campaign daily limit applies to the scheduled date.',
  })
  @ApiParam({ name: 'campaignId', example: 21 })
  @OkExample({
    ...STORE_PUSH_CAMPAIGN_EXAMPLE,
    approvalStatus: 'APPROVED',
    status: 'SCHEDULED',
    scheduledAt: '2026-10-24T09:00:00.000Z',
  })
  @StandardErrors()
  schedule(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('campaignId', ParseIntPipe) campaignId: number,
    @Body() dto: ScheduleStorePushCampaignDto,
  ) {
    return this.campaigns.scheduleForStore(userId, storeId, campaignId, dto.scheduledAt);
  }

  @Post(':campaignId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a store campaign' })
  @ApiParam({ name: 'campaignId', example: 21 })
  @OkExample({ ...STORE_PUSH_CAMPAIGN_EXAMPLE, status: 'CANCELLED' })
  @StandardErrors()
  cancel(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('campaignId', ParseIntPipe) campaignId: number,
  ) {
    return this.campaigns.cancelForStore(userId, storeId, campaignId);
  }
}
