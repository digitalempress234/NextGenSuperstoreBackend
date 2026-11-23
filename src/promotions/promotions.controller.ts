import {
  Body,
  Controller,
  Get,
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
import { CreatedExample, OkExample, StandardErrors } from '../common/api-docs';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { AuthenticatedStaff, StaffJwtGuard } from '../staff/staff-jwt.guard';
import { StaffPermissionGuard } from '../staff/staff-permission.guard';
import {
  CreateMarketplacePromotionDto,
  PromotionListQueryDto,
  ReviewMarketplacePromotionDto,
  UpdateMarketplacePromotionDto,
} from './dto/marketplace-promotion.dto';
import { PromotionsService } from './promotions.service';

const PROMOTION_EXAMPLE = {
  id: 11,
  storeId: 6,
  title: 'Black Friday Mega Sale',
  slug: 'black-friday-mega-sale-a1b2c3d4',
  subtitle: 'Save up to 40% on selected products',
  imageUrl: 'https://res.cloudinary.com/example/image/upload/black-friday.png',
  ctaLabel: 'Shop sale',
  badgeText: 'UP TO 40% OFF',
  type: 'SEASONAL_SALE',
  status: 'PENDING',
  startsAt: '2026-11-27T00:00:00.000Z',
  endsAt: '2026-11-30T23:59:59.000Z',
  store: { id: 6, storeName: 'Campus Hub', city: 'Ibadan', state: 'Oyo' },
  products: [],
};

@ApiTags('Store marketplace promotions')
@ApiCookieAuth('purse_access_token')
@RequirePermissions('stores.update')
@Controller('stores/:storeId/promotions')
export class StorePromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Post()
  @ApiOperation({
    summary: 'Vendor: create a marketplace promotional post for admin review',
    description:
      'The store must be approved and active. The post remains hidden from the marketplace until an administrator approves it and its schedule is active.',
  })
  @CreatedExample(PROMOTION_EXAMPLE, 'Promotion submitted for review')
  @StandardErrors()
  create(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Body() dto: CreateMarketplacePromotionDto,
  ) {
    return this.promotions.create(userId, storeId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Vendor: list marketplace promotions for this store' })
  @OkExample({ items: [PROMOTION_EXAMPLE], total: 1, page: 1, limit: 15, pages: 1 })
  list(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query() query: PromotionListQueryDto,
  ) {
    return this.promotions.listForStore(userId, storeId, query);
  }

  @Get(':promotionId')
  @ApiOperation({ summary: 'Vendor: get one marketplace promotion' })
  @ApiParam({ name: 'promotionId', example: 11 })
  @OkExample(PROMOTION_EXAMPLE)
  get(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('promotionId', ParseIntPipe) promotionId: number,
  ) {
    return this.promotions.getForStore(userId, storeId, promotionId);
  }

  @Patch(':promotionId')
  @ApiOperation({
    summary: 'Vendor: update a promotional post and resubmit it for review',
    description: 'Editing an approved or rejected promotion resets its status to PENDING.',
  })
  @OkExample(PROMOTION_EXAMPLE)
  update(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('promotionId', ParseIntPipe) promotionId: number,
    @Body() dto: UpdateMarketplacePromotionDto,
  ) {
    return this.promotions.update(userId, storeId, promotionId, dto);
  }

  @Post(':promotionId/archive')
  @ApiOperation({ summary: 'Vendor: remove a promotional post from the marketplace' })
  @OkExample({ ...PROMOTION_EXAMPLE, status: 'ARCHIVED' })
  archive(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('promotionId', ParseIntPipe) promotionId: number,
  ) {
    return this.promotions.archive(userId, storeId, promotionId);
  }
}

@ApiTags('Admin marketplace promotions')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard, StaffPermissionGuard)
@RequirePermissions('promotions.review')
@Controller('admin/marketplace-promotions')
export class AdminPromotionsController {
  constructor(private readonly promotions: PromotionsService) {}

  @Get()
  @ApiOperation({ summary: 'Admin: list marketplace promotional posts awaiting or after review' })
  @OkExample({ items: [PROMOTION_EXAMPLE], total: 1, page: 1, limit: 15, pages: 1 })
  list(@Query() query: PromotionListQueryDto) {
    return this.promotions.listForAdmin(query);
  }

  @Get(':promotionId')
  @ApiOperation({ summary: 'Admin: get a marketplace promotion and its selected products' })
  @OkExample(PROMOTION_EXAMPLE)
  get(@Param('promotionId', ParseIntPipe) promotionId: number) {
    return this.promotions.getForAdmin(promotionId);
  }

  @Patch(':promotionId/review')
  @ApiOperation({
    summary: 'Admin: approve or reject a marketplace promotional post',
    description: 'A rejection requires a reason. Every decision is written to the audit log.',
  })
  @OkExample({ ...PROMOTION_EXAMPLE, status: 'APPROVED' })
  review(
    @Req() request: { staffUser: AuthenticatedStaff },
    @Param('promotionId', ParseIntPipe) promotionId: number,
    @Body() dto: ReviewMarketplacePromotionDto,
  ) {
    return this.promotions.review(request.staffUser.id, promotionId, dto);
  }
}
