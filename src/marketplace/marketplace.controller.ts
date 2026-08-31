import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';

import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import {
  AddCompareDto,
  AddWishlistDto,
  BrowseMarketplaceDto,
  SearchStoresDto,
} from './dto/marketplace.dto';
import { MarketplaceService } from './marketplace.service';

@ApiTags('Marketplace')
@Controller('marketplace')
export class MarketplaceController {
  constructor(private readonly marketplace: MarketplaceService) {}

  @Public()
  @Get('home')
  @ApiOperation({
    summary: 'Get the marketplace home payload for the customer application',
    description:
      'Returns the categories, active stores, featured products and popular products used to build the marketplace landing page.',
  })
  @OkExample({
    categories: [
      { id: 4, name: 'Beverages', level: 0 },
    ],
    stores: [
      {
        id: 10,
        storeName: 'Purse Supermarket Ikeja',
        city: 'Ikeja',
        state: 'Lagos',
      },
    ],
    featuredProducts: [],
    popularProducts: [],
  })
  @StandardErrors()
  home() {
    return this.marketplace.home();
  }

  @Public()
  @Get('browse')
  @ApiOperation({
    summary: 'Browse and search products across the marketplace',
    description:
      'Searches products and returns the active store offers for each product so the frontend can show prices and stores.',
  })
  @ApiQuery({
    name: 'q',
    required: false,
    example: 'milk',
  })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    example: 4,
  })
  @ApiQuery({
    name: 'storeId',
    required: false,
    example: 10,
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    enum: ['relevance', 'price_asc', 'price_desc', 'newest'],
    example: 'price_asc',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    example: 20,
  })
  @OkExample({
    items: [
      {
        id: 42,
        name: 'Coca-Cola 50cl',
        category: { id: 4, name: 'Beverages' },
        offers: [
          {
            id: 900,
            price: '450.00',
            stockQuantity: 20,
            store: {
              id: 10,
              storeName: 'Purse Supermarket Ikeja',
              city: 'Ikeja',
              state: 'Lagos',
            },
          },
          {
            id: 901,
            price: '500.00',
            stockQuantity: 8,
            store: {
              id: 12,
              storeName: 'Purse Supermarket Surulere',
              city: 'Surulere',
              state: 'Lagos',
            },
          },
        ],
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      pages: 1,
    },
  })
  @StandardErrors()
  browse(@Query() query: BrowseMarketplaceDto) {
    return this.marketplace.browse(query);
  }

  @Public()
  @Get('products/:id')
  @ApiOperation({
    summary: 'Get a product with images, reviews and every active store offer',
  })
  @ApiParam({ name: 'id', example: 42 })
  @OkExample({
    id: 42,
    name: 'Coca-Cola 50cl',
    comparison: {
      lowestPrice: 450,
      highestPrice: 500,
      storeCount: 2,
    },
    offers: [],
  })
  @StandardErrors()
  product(@Param('id', ParseIntPipe) productId: number) {
    return this.marketplace.product(productId);
  }

  @Public()
  @Get('products/:id/compare')
  @ApiOperation({
    summary: 'Compare the price and availability of a product across stores',
  })
  @ApiParam({ name: 'id', example: 42 })
  @OkExample({
    productId: 42,
    offers: [
      { storeId: 10, price: 450, availability: true },
      { storeId: 12, price: 500, availability: true },
    ],
  })
  @StandardErrors()
  compare(@Param('id', ParseIntPipe) productId: number) {
    return this.marketplace.compare(productId);
  }

  @Public()
  @Get('stores')
  @ApiOperation({
    summary: 'Search and browse active marketplace stores',
  })
  @ApiQuery({ name: 'q', required: false, example: 'supermarket' })
  @ApiQuery({ name: 'state', required: false, example: 'Lagos' })
  @ApiQuery({ name: 'city', required: false, example: 'Ikeja' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @OkExample({
    items: [
      {
        id: 10,
        storeName: 'Purse Supermarket Ikeja',
        city: 'Ikeja',
        state: 'Lagos',
        _count: {
          products: 140,
          reviews: 22,
        },
      },
    ],
    pagination: {
      page: 1,
      limit: 20,
      total: 1,
      pages: 1,
    },
  })
  @StandardErrors()
  stores(@Query() query: SearchStoresDto) {
    return this.marketplace.stores(query);
  }

  @Public()
  @Get('stores/:id')
  @ApiOperation({
    summary: 'Get a public store page with its active product catalogue',
  })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({
    id: 10,
    storeName: 'Purse Supermarket Ikeja',
    city: 'Ikeja',
    state: 'Lagos',
    products: [],
  })
  @StandardErrors()
  store(@Param('id', ParseIntPipe) storeId: number) {
    return this.marketplace.store(storeId);
  }

  @Get('wishlist')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({
    summary: 'Get the authenticated customer wishlist',
  })
  @OkExample([
    {
      id: 1,
      productId: 42,
      product: {
        id: 42,
        name: 'Coca-Cola 50cl',
        offers: [],
      },
    },
  ])
  @StandardErrors()
  wishlist(@CurrentUser('id') userId: number) {
    return this.marketplace.wishlist(userId);
  }

  @Post('wishlist')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({
    summary: 'Add a product to the authenticated customer wishlist',
  })
  @OkExample({
    id: 1,
    userId: 101,
    productId: 42,
  })
  @StandardErrors()
  addWishlist(
    @CurrentUser('id') userId: number,
    @Body() dto: AddWishlistDto,
  ) {
    return this.marketplace.addWishlist(userId, dto);
  }

  @Delete('wishlist/:productId')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({
    summary: 'Remove a product from the authenticated customer wishlist',
  })
  @ApiParam({ name: 'productId', example: 42 })
  @OkExample({ removed: true, productId: 42 })
  @StandardErrors()
  removeWishlist(
    @CurrentUser('id') userId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.marketplace.removeWishlist(userId, productId);
  }

  @Get('compare-list')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({
    summary: 'Get the authenticated customer product comparison list',
  })
  @OkExample({
    items: [
      {
        productId: 42,
        product: {
          id: 42,
          name: 'Coca-Cola 50cl',
          offers: [],
        },
      },
    ],
  })
  @StandardErrors()
  compareList(@CurrentUser('id') userId: number) {
    return this.marketplace.compareList(userId);
  }

  @Post('compare-list')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({
    summary: 'Add a product to the authenticated customer comparison list',
  })
  @OkExample({
    id: 1,
    compareListId: 11,
    productId: 42,
  })
  @StandardErrors()
  addCompare(
    @CurrentUser('id') userId: number,
    @Body() dto: AddCompareDto,
  ) {
    return this.marketplace.addCompare(userId, dto);
  }

  @Delete('compare-list/:productId')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({
    summary: 'Remove a product from the authenticated comparison list',
  })
  @ApiParam({ name: 'productId', example: 42 })
  @OkExample({ removed: true, productId: 42 })
  @StandardErrors()
  removeCompare(
    @CurrentUser('id') userId: number,
    @Param('productId', ParseIntPipe) productId: number,
  ) {
    return this.marketplace.removeCompare(userId, productId);
  }
}
