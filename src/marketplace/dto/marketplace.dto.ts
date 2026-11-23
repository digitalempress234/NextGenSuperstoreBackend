import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsPositive, IsString, Max, Min } from 'class-validator';

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
    example: 450,
    description:
      'Return offers whose effective price (discount price when present) is at least this amount.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({
    example: 5000,
    description:
      'Return offers whose effective price (discount price when present) is at most this amount.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxPrice?: number;

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

  @ApiPropertyOptional({ example: 15, minimum: 1, maximum: 15, default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15)
  limit = 15;
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

  @ApiPropertyOptional({ example: 15, minimum: 1, maximum: 15, default: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15)
  limit = 15;
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

export class MoveWishlistToCartDto {
  @ApiPropertyOptional({ example: 900, description: 'The exact store offer to add.' })
  @IsInt()
  @IsPositive()
  storeProductId!: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity = 1;
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
