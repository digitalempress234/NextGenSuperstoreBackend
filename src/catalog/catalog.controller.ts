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
import { OkExample, StandardErrors } from '../common/api-docs';
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
  @ApiQuery({ name: 'limit', required: false, example: 20 })
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
    limit: 20,
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
  @ApiOperation({ summary: 'List active product categories' })
  @OkExample([{ id: 4, name: 'Beverages', level: 0, isActive: true }])
  @StandardErrors()
  categories() {
    return this.catalog.categories();
  }

  @Post('categories')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('products.create')
  @ApiOperation({ summary: 'Create a catalog category' })
  @OkExample({ id: 4, name: 'Beverages', parentId: null, level: 0, isActive: true })
  @StandardErrors()
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.catalog.createCategory(dto);
  }

  @Post('products')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('products.create')
  @ApiOperation({ summary: 'Create a canonical product' })
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
  @ApiOperation({ summary: 'Update a canonical product' })
  @ApiParam({ name: 'id', example: 42 })
  @OkExample({ id: 42, name: 'Coca-Cola 50cl', status: true })
  @StandardErrors()
  updateProduct(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.catalog.updateProduct(id, dto);
  }

  @Delete('products/:id')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('products.archive')
  @ApiOperation({ summary: 'Archive a catalog product' })
  @ApiParam({ name: 'id', example: 42 })
  @OkExample({ id: 42, status: false })
  @StandardErrors()
  archiveProduct(@Param('id', ParseIntPipe) id: number) {
    return this.catalog.archiveProduct(id);
  }
}
