import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/public.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, RequireAuth, StandardErrors } from '../common/api-docs';
import { CurrentUser } from '../common/current-user.decorator';
import {
  CreateCategoryDto,
  CreateProductDto,
  ProductSearchDto,
  UpdateProductDto,
} from './dto/catalog.dto';
import { CatalogService } from './catalog.service';

@ApiTags('Catalog')
@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Public()
  @Get('products')
  @ApiOperation({
    summary: 'Search the master product catalog and return store offers for comparison',
  })
  @ApiQuery({ name: 'q', required: false, example: 'coke' })
  @ApiQuery({ name: 'categoryId', required: false, example: 4 })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @OkExample({
    items: [
      {
        id: 42,
        name: 'Coca-Cola 50cl',
        barcode: '5449000000996',
        offers: [
          {
            id: 900,
            price: 450,
            store: { id: 10, storeName: 'Store A', city: 'Ikeja' },
          },
          {
            id: 901,
            price: 500,
            store: { id: 12, storeName: 'Store B', city: 'Surulere' },
          },
        ],
      },
    ],
    page: 1,
    limit: 10,
    total: 1,
    pages: 1,
  })
  @StandardErrors()
  products(@Query() query: ProductSearchDto) {
    return this.catalog.search(query);
  }

  @Public()
  @Get('products/:id')
  @ApiOperation({ summary: 'Get one product with all active store offers' })
  @ApiParam({ name: 'id', example: 42 })
  @OkExample({
    id: 42,
    name: 'Coca-Cola 50cl',
    offers: [{ id: 900, price: 450, stockQuantity: 20, storeId: 10 }],
  })
  @StandardErrors()
  product(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.one(id);
  }

  @Public()
  @Get('categories')
  @ApiOperation({
    summary: 'List all active product categories with subcategories',
    description:
      'Returns a flat-ish array of **top-level categories** (`level: 0`), each containing a `children[]` array ' +
      'of its active subcategories (`level: 1`). \n\n' +
      'No authentication required — public endpoint. \n\n' +
      '**Use cases**: category nav menu, filter sidebar. \n' +
      '**Eligible roles**: Public (no auth needed)',
  })
  @OkExample([
    {
      id: 3,
      name: 'Supermarket',
      level: 0,
      isActive: true,
      parentId: null,
      children: [
        { id: 11, name: 'Beverages', level: 1, isActive: true, parentId: 3 },
        { id: 12, name: 'Snacks & Confectionery', level: 1, isActive: true, parentId: 3 },
      ],
    },
  ])
  @StandardErrors()
  categories() {
    return this.catalog.categories();
  }

  @Public()
  @Get('categories/:id')
  @ApiOperation({
    summary: 'Get a single category with its parent and subcategories',
    description:
      'Returns the full detail for one category. ' +
      'If the category is a **top-level** category (`level: 0`), `parent` is `null` and `children[]` lists its subcategories. ' +
      'If the category is a **subcategory** (`level: 1`), `parent` contains the parent category object and `children[]` is empty. \n\n' +
      'No authentication required — public endpoint. \n\n' +
      '**Eligible roles**: Public (no auth needed)',
  })
  @ApiParam({
    name: 'id',
    example: 3,
    description: 'Numeric category ID.',
  })
  @OkExample({
    id: 3,
    name: 'Supermarket',
    level: 0,
    isActive: true,
    parentId: null,
    parent: null,
    children: [
      { id: 11, name: 'Beverages', level: 1, isActive: true, parentId: 3 },
      { id: 12, name: 'Snacks & Confectionery', level: 1, isActive: true, parentId: 3 },
      { id: 13, name: 'Household Essentials', level: 1, isActive: true, parentId: 3 },
    ],
  })
  @StandardErrors()
  category(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.getCategory(id);
  }


  @Post('categories')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('products.create')
  @RequireAuth(['products.create'], ['OPERATIONS_ADMIN', 'MERCHANT_ADMIN', 'SUPER_ADMIN'])
  @ApiOperation({
    summary: 'Create a catalog category',
    description:
      'Creates a new product category. Pass a `parentId` to create a subcategory under an existing top-level category. \n\n' +
      '**Required permission**: `products.create` \n' +
      '**Eligible roles**: `OPERATIONS_ADMIN`, `MERCHANT_ADMIN`, `SUPER_ADMIN`',
  })
  @OkExample({ id: 4, name: 'Beverages', parentId: null, level: 0, isActive: true })
  @StandardErrors()
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Post('products')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('products.create')
  @RequireAuth(['products.create'], ['OPERATIONS_ADMIN', 'MERCHANT_ADMIN', 'SUPER_ADMIN'])
  @ApiOperation({
    summary: 'Create a canonical product in the master catalog',
    description:
      'Creates a canonical product entry that all stores can offer. ' +
      'Each store then creates a `StoreProduct` offer linked to this product. \n\n' +
      '**Required permission**: `products.create` \n' +
      '**Eligible roles**: `OPERATIONS_ADMIN`, `MERCHANT_ADMIN`, `SUPER_ADMIN`',
  })
  @OkExample({
    id: 42,
    name: 'Coca-Cola 50cl',
    barcode: '5449000000996',
    categoryId: 4,
  })
  @StandardErrors()
  createProduct(@Body() dto: CreateProductDto) {
    return this.catalog.createProduct(dto);
  }

  @Patch('products/:id')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('products.update')
  @RequireAuth(['products.update'], ['OPERATIONS_ADMIN', 'MERCHANT_ADMIN', 'SUPER_ADMIN'])
  @ApiOperation({
    summary: 'Update a canonical product',
    description:
      '**Required permission**: `products.update` \n' +
      '**Eligible roles**: `OPERATIONS_ADMIN`, `MERCHANT_ADMIN`, `SUPER_ADMIN`',
  })
  @ApiParam({ name: 'id', example: 42, description: 'Canonical product ID.' })
  @OkExample({ id: 42, name: 'Coca-Cola 50cl', status: true })
  @StandardErrors()
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('products.archive')
  @RequireAuth(['products.archive'], ['OPERATIONS_ADMIN', 'SUPER_ADMIN'])
  @ApiOperation({
    summary: 'Archive (soft-delete) a catalog product',
    description:
      'Sets the product as inactive. Store offers linked to it will no longer appear in search. \n\n' +
      '**Required permission**: `products.archive` \n' +
      '**Eligible roles**: `OPERATIONS_ADMIN`, `SUPER_ADMIN`',
  })
  @ApiParam({ name: 'id', example: 42, description: 'Canonical product ID.' })
  @OkExample({ id: 42, status: false })
  @StandardErrors()
  archiveProduct(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.archiveProduct(id);
  }
}
