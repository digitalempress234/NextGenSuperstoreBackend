import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import {
  CreateStoreDto,
  SubmitCacDto,
  UpdateStoreDto,
  UpsertStoreProductDto,
} from './dto/store.dto';
import { StoreCacService } from './store-cac.service';
import { StoreWalletService } from './store-wallet.service';
import { StoreWithdrawDto } from './dto/store-wallet.dto';
import { StoresService } from './stores.service';
import { StoreCampaignDto, StoreOrderQueryDto } from './dto/store-operations.dto';
import {
  STORE_CAMPAIGNS_EXAMPLE,
  STORE_COMPARE_DEALS_EXAMPLE,
  STORE_INBOX_EXAMPLE,
  STORE_ORDERS_EXAMPLE,
  STORE_RIDERS_EXAMPLE,
  STORE_SETTINGS_EXAMPLE,
} from '../common/docs-examples';
import { PaginationDto } from '../common/dto/pagination.dto';

@ApiTags('Stores')
@Controller('stores')
export class StoresController {
  constructor(
    private readonly storesService: StoresService,
    private readonly storeCacService: StoreCacService,
    private readonly storeWallet: StoreWalletService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'List active stores' })
  @OkExample([
    {
      id: 10,
      storeName: 'Purse Supermarket Ikeja',
      state: 'Lagos',
      city: 'Ikeja',
      address: '12 Allen Avenue',
      isActive: true,
    },
  ])
  @StandardErrors()
  list() {
    return this.storesService.list();
  }

  @Get(':id/orders')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('orders.view')
  @ApiOperation({ summary: 'Vendor/store agent: list store orders' })
  @OkExample(STORE_ORDERS_EXAMPLE, 'Paginated store orders')
  orders(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Query() query: StoreOrderQueryDto,
  ) {
    return this.storesService.orders(userId, storeId, query);
  }

  @Get(':id/orders/:orderId')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('orders.view')
  @ApiOperation({ summary: 'Vendor/store agent: get a store order detail' })
  order(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.storesService.order(userId, storeId, orderId);
  }

  @Get(':id/campaigns')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.view')
  @ApiOperation({ summary: 'Vendor: list store reward campaigns' })
  @OkExample(STORE_CAMPAIGNS_EXAMPLE, 'Store reward campaigns')
  campaigns(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Query() query: PaginationDto,
  ) {
    return this.storesService.campaigns(userId, storeId, query.page, query.limit);
  }

  @Post(':id/campaigns')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.update')
  @ApiOperation({ summary: 'Vendor: create a store reward campaign' })
  createCampaign(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Body() dto: StoreCampaignDto,
  ) {
    return this.storesService.createCampaign(userId, storeId, dto);
  }

  @Patch(':id/campaigns/:campaignId')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.update')
  @ApiOperation({ summary: 'Vendor: update a store reward campaign' })
  updateCampaign(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Param('campaignId') campaignId: string,
    @Body() dto: StoreCampaignDto,
  ) {
    return this.storesService.updateCampaign(userId, storeId, campaignId, dto);
  }

  @Get(':id/inbox')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('chats.use')
  @ApiOperation({ summary: 'Vendor/store agent: list the store inbox' })
  @OkExample(STORE_INBOX_EXAMPLE, 'Store inbox conversations')
  inbox(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Query() query: PaginationDto,
  ) {
    return this.storesService.inbox(userId, storeId, query.page, query.limit);
  }

  @Get(':id/riders')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('orders.view')
  @ApiOperation({ summary: 'Vendor: list riders serving this store' })
  @OkExample(STORE_RIDERS_EXAMPLE, 'Riders serving the store')
  riders(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Query() query: PaginationDto,
  ) {
    return this.storesService.riders(userId, storeId, query.page, query.limit);
  }

  @Get(':id/compare-deals')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.view')
  @ApiOperation({ summary: 'Vendor: compare store offers with competing active offers' })
  @OkExample(STORE_COMPARE_DEALS_EXAMPLE, 'Store and competitor deal comparison')
  compareDeals(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Query() query: PaginationDto,
  ) {
    return this.storesService.compareDeals(userId, storeId, query.page, query.limit);
  }

  @Get(':id/settings')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.view')
  @ApiOperation({ summary: 'Vendor/store agent: get store settings' })
  @OkExample(STORE_SETTINGS_EXAMPLE, 'Store settings')
  settings(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) storeId: number) {
    return this.storesService.settings(userId, storeId);
  }

  @Patch(':id/settings')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.update')
  @ApiOperation({ summary: 'Vendor: update store settings' })
  @OkExample(STORE_SETTINGS_EXAMPLE, 'Updated store settings')
  @StandardErrors()
  updateSettings(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.update(userId, storeId, dto);
  }

  @Get('mine')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.view')
  @ApiOperation({ summary: 'List stores owned or managed by the current user' })
  @OkExample([{ id: 10, storeName: 'Purse Supermarket Ikeja', isActive: true }])
  @StandardErrors()
  mine(@CurrentUser('id') userId: number) {
    return this.storesService.mine(userId);
  }

  @Get(':id/overview')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.view')
  @ApiOperation({ summary: 'Get overview statistics for a specific store' })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample(
    { totalOrders: 150, pendingOrders: 5, totalRevenue: 125000.5, totalProducts: 300 },
    'Store overview statistics',
  )
  @StandardErrors()
  overview(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) storeId: number) {
    return this.storesService.overview(userId, storeId);
  }

  @RequirePermissions('stores.create')
  @Post()
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({ summary: 'Create a merchant store' })
  @OkExample({
    id: 10,
    storeName: 'Purse Supermarket Ikeja',
    ownerUserId: 101,
    isActive: false,
  })
  @StandardErrors()
  create(@CurrentUser('id') userId: number, @Body() dto: CreateStoreDto) {
    return this.storesService.create(userId, dto);
  }

  @Patch(':id')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.update')
  @ApiOperation({ summary: 'Update a store' })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({ id: 10, storeName: 'Purse Supermarket Ikeja', city: 'Ikeja' })
  @StandardErrors()
  update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Body() dto: UpdateStoreDto,
  ) {
    return this.storesService.update(userId, storeId, dto);
  }

  @RequirePermissions('products.price.update')
  @Post(':id/products')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({ summary: 'Create or update a store-specific product offer' })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({
    id: 900,
    storeId: 10,
    productId: 42,
    price: 475,
    stockQuantity: 120,
    availability: true,
  })
  @StandardErrors()
  addProduct(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Body() dto: UpsertStoreProductDto,
  ) {
    return this.storesService.addProduct(userId, storeId, dto);
  }

  @Post(':id/cac')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.update')
  @ApiOperation({
    summary: 'Submit CAC registration number for store verification',
    description:
      'Calls QoreID CAC Basic API with the supplied regNumber and persists the result. ' +
      'The store will be activated automatically if QoreID returns VERIFIED and an admin approves.',
  })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({
    id: 1,
    storeId: 10,
    regNumber: 'RC123456',
    status: 'PENDING',
    qoreidStatus: 'VERIFIED',
  })
  @StandardErrors()
  submitCac(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Body() dto: SubmitCacDto,
  ) {
    return this.storeCacService.submit(userId, storeId, dto.regNumber);
  }

  @Get(':id/cac')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.view')
  @ApiOperation({ summary: 'Get CAC verification status for a store' })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({
    id: 1,
    regNumber: 'RC123456',
    status: 'PENDING',
    companyName: 'Purse Ltd',
    companyType: 'Private Limited',
  })
  @StandardErrors()
  getCacStatus(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) storeId: number) {
    return this.storeCacService.getStatus(userId, storeId);
  }

  @Get(':id/wallet')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.view')
  @ApiOperation({ summary: 'Get store wallet balance and locked amount' })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({ balance: 74250, lockedBalance: 0 })
  @StandardErrors()
  getWallet(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) storeId: number) {
    return this.storeWallet.getWallet(userId, storeId);
  }

  @Get(':id/wallet/transactions')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.view')
  @ApiOperation({ summary: 'Get paginated store wallet transaction ledger' })
  @ApiParam({ name: 'id', example: 10 })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 15 })
  @OkExample({ items: [], total: 0, page: 1, limit: 15 })
  @StandardErrors()
  getTransactions(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 15,
  ) {
    return this.storeWallet.getTransactions(userId, storeId, page, limit);
  }

  @Post(':id/wallet/withdraw')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.update')
  @ApiOperation({
    summary: 'Request a store wallet withdrawal',
    description:
      'MANUAL creates a pending request for admin to process. AUTO triggers an immediate Paystack transfer.',
  })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({ id: 1, amount: 50000, status: 'PENDING', mode: 'MANUAL', bankName: 'GTBank' })
  @StandardErrors()
  requestWithdrawal(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Body() dto: StoreWithdrawDto,
  ) {
    return this.storeWallet.requestWithdrawal(userId, storeId, dto);
  }

  @Get(':id/wallet/withdrawals')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('stores.view')
  @ApiOperation({ summary: 'List withdrawal history for a store' })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample([{ id: 1, amount: 50000, status: 'PAID', mode: 'MANUAL', bankName: 'GTBank' }])
  @StandardErrors()
  getWithdrawals(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) storeId: number) {
    return this.storeWallet.getWithdrawals(userId, storeId);
  }
}
