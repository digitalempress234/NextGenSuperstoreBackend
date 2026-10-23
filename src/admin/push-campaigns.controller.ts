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
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { AdminRoute } from '../auth/admin-route.decorator';
import { CreatedExample, OkExample, RequireAuth, StandardErrors } from '../common/api-docs';
import { RequirePermissions } from '../common/permissions.decorator';
import { PushCampaignsService } from '../notifications/push-campaigns.service';
import { AuthenticatedStaff, StaffJwtGuard } from '../staff/staff-jwt.guard';
import { StaffPermissionGuard } from '../staff/staff-permission.guard';
import {
  CreatePushCampaignDto,
  PushCampaignListQueryDto,
  ReviewPushCampaignDto,
  SchedulePushCampaignDto,
  TestPushCampaignDto,
  UpdatePushCampaignDto,
} from './dto/push-campaign.dto';

const CAMPAIGN_EXAMPLE = {
  id: 12,
  title: 'Weekend delivery offer',
  message: 'Order this weekend and enjoy free delivery on eligible products.',
  imageUrl: 'https://cdn.example.com/campaigns/weekend-offer.jpg',
  deepLink: 'superstore://campaigns/weekend-offer',
  audienceType: 'CUSTOMERS',
  audienceFilter: { state: 'Oyo', city: 'Ibadan' },
  includeInApp: true,
  status: 'DRAFT',
  approvalStatus: 'NOT_REQUIRED',
  scheduledAt: null,
  totalRecipients: 0,
  deliveredCount: 0,
  failedCount: 0,
  skippedCount: 0,
  createdById: 1,
  createdAt: '2026-10-18T18:30:00.000Z',
};

@ApiTags('Admin push campaigns')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard, StaffPermissionGuard)
@RequirePermissions('notifications.send')
@Controller('admin/push-campaigns')
export class PushCampaignsController {
  constructor(private readonly campaigns: PushCampaignsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an advertising push campaign draft',
    description:
      'Requires notifications.send. Supports all active users, customers, riders, vendors, or selected user IDs, with optional state/city targeting.',
  })
  @RequireAuth(['notifications.send'], ['SUPER_ADMIN'])
  @CreatedExample(CAMPAIGN_EXAMPLE, 'Campaign draft created.')
  @StandardErrors()
  create(@Req() req: { staffUser: AuthenticatedStaff }, @Body() dto: CreatePushCampaignDto) {
    return this.campaigns.create(dto, req.staffUser.id);
  }

  @Get()
  @ApiOperation({ summary: 'List push campaigns and delivery totals' })
  @RequireAuth(['notifications.send'], ['SUPER_ADMIN'])
  @OkExample(
    {
      items: [CAMPAIGN_EXAMPLE],
      pagination: { page: 1, limit: 15, total: 1, totalPages: 1 },
    },
    'Paginated campaigns.',
  )
  @StandardErrors()
  list(@Query() query: PushCampaignListQueryDto) {
    return this.campaigns.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a push campaign, delivery totals, and latest recipient results' })
  @ApiParam({ name: 'id', example: 12 })
  @RequireAuth(['notifications.send'], ['SUPER_ADMIN'])
  @OkExample(CAMPAIGN_EXAMPLE)
  @StandardErrors()
  get(@Param('id', ParseIntPipe) id: number) {
    return this.campaigns.get(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a draft or scheduled push campaign',
    description: 'Campaign content and audience become immutable once sending starts.',
  })
  @ApiParam({ name: 'id', example: 12 })
  @RequireAuth(['notifications.send'], ['SUPER_ADMIN'])
  @OkExample(CAMPAIGN_EXAMPLE)
  @StandardErrors()
  update(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePushCampaignDto,
  ) {
    return this.campaigns.update(id, dto, req.staffUser.id);
  }

  @Patch(':id/review')
  @ApiOperation({
    summary: 'Approve or reject a vendor-created push campaign',
    description:
      'Only vendor-created draft campaigns require review. A rejection must include a reason, and the vendor is notified of the decision by in-app notification and push notification when enabled.',
  })
  @ApiParam({ name: 'id', example: 21 })
  @RequireAuth(['notifications.send'], ['SUPER_ADMIN'])
  @OkExample({
    ...CAMPAIGN_EXAMPLE,
    id: 21,
    storeId: 6,
    audienceType: 'STORE_CUSTOMERS',
    approvalStatus: 'APPROVED',
    reviewedById: 1,
    reviewedAt: '2026-10-22T12:30:00.000Z',
  })
  @StandardErrors()
  review(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewPushCampaignDto,
  ) {
    return this.campaigns.reviewVendorCampaign(id, req.staffUser.id, dto);
  }

  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Send a test campaign to one user',
    description:
      'Honors that user’s MARKETING notification preferences. Test sends do not affect campaign totals.',
  })
  @ApiParam({ name: 'id', example: 12 })
  @RequireAuth(['notifications.send'], ['SUPER_ADMIN'])
  @OkExample({
    campaignId: 12,
    userId: 8,
    inAppDelivered: true,
    push: { enabled: true, attempted: 1, successful: 1, failed: 0 },
    optedOut: false,
  })
  @StandardErrors()
  test(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TestPushCampaignDto,
  ) {
    return this.campaigns.test(id, dto.userId, req.staffUser.id);
  }

  @Post(':id/send')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue a push campaign for immediate delivery',
    description:
      'Returns immediately. The background dispatcher sends in batches and records delivered, failed, and skipped recipient totals.',
  })
  @ApiParam({ name: 'id', example: 12 })
  @RequireAuth(['notifications.send'], ['SUPER_ADMIN'])
  @OkExample({ ...CAMPAIGN_EXAMPLE, status: 'SENDING' }, 'Campaign accepted for sending.')
  @StandardErrors()
  send(@Req() req: { staffUser: AuthenticatedStaff }, @Param('id', ParseIntPipe) id: number) {
    return this.campaigns.sendNow(id, req.staffUser.id);
  }

  @Post(':id/schedule')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Schedule a push campaign',
    description: 'scheduledAt must be a future ISO-8601 timestamp.',
  })
  @ApiParam({ name: 'id', example: 12 })
  @RequireAuth(['notifications.send'], ['SUPER_ADMIN'])
  @OkExample({ ...CAMPAIGN_EXAMPLE, status: 'SCHEDULED', scheduledAt: '2026-10-20T09:00:00.000Z' })
  @StandardErrors()
  schedule(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SchedulePushCampaignDto,
  ) {
    return this.campaigns.schedule(id, dto.scheduledAt, req.staffUser.id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a draft, scheduled, or sending campaign',
    description:
      'A sending campaign stops before its next batch; notifications already dispatched cannot be recalled.',
  })
  @ApiParam({ name: 'id', example: 12 })
  @RequireAuth(['notifications.send'], ['SUPER_ADMIN'])
  @OkExample({ ...CAMPAIGN_EXAMPLE, status: 'CANCELLED' })
  @StandardErrors()
  cancel(@Req() req: { staffUser: AuthenticatedStaff }, @Param('id', ParseIntPipe) id: number) {
    return this.campaigns.cancel(id, req.staffUser.id);
  }
}
