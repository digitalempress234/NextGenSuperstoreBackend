import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class BrowseMarketplaceDto {
  @ApiPropertyOptional({
    example: 'milk',
    description: 'Search by product name, brand, or barcode.',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  categoryId?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  storeId?: number;

  @ApiPropertyOptional({
    example: '450',
    description: 'Return offers with a minimum unit price.',
  })
  @IsOptional()
  @IsString()
  minPrice?: string;

  @ApiPropertyOptional({
    example: '5000',
    description: 'Return offers with a maximum unit price.',
  })
  @IsOptional()
  @IsString()
  maxPrice?: string;

  @ApiPropertyOptional({
    example: 'price_asc',
    enum: ['relevance', 'price_asc', 'price_desc', 'newest'],
  })
  @IsOptional()
  @IsString()
  sort?: 'relevance' | 'price_asc' | 'price_desc' | 'newest';

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class SearchStoresDto {
  @ApiPropertyOptional({ example: 'supermarket' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class AddWishlistDto {
  @ApiPropertyOptional({ example: 42 })
  @IsInt()
  @IsPositive()
  productId!: number;
}

export class AddCompareDto {
  @ApiPropertyOptional({ example: 42 })
  @IsInt()
  @IsPositive()
  productId!: number;
}

export class UpdateCartItemDto {
  @ApiPropertyOptional({
    example: 3,
    minimum: 1,
    description: 'New absolute quantity for the cart line.',
  })
  @IsInt()
  @Min(1)
  quantity!: number;
}
