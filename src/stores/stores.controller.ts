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
import { StoreWalletService, StoreWithdrawDto } from './store-wallet.service';
import { StoresService } from './stores.service';

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
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @OkExample({ items: [], total: 0, page: 1, limit: 10 })
  @StandardErrors()
  getTransactions(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) storeId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
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
