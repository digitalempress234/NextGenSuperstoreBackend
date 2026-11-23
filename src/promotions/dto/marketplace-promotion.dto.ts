import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { MarketplacePromotionStatus, MarketplacePromotionType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMarketplacePromotionDto {
  @ApiProperty({ example: 'Black Friday Mega Sale' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiPropertyOptional({ example: 'Save up to 40% on selected products' })
  @IsOptional()
  @IsString()
  @MaxLength(191)
  subtitle?: string;

  @ApiPropertyOptional({ example: 'Limited Black Friday offers while stocks last.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/example/image/upload/black-friday.png' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  imageUrl!: string;

  @ApiPropertyOptional({ example: 'ohoo://stores/6/promotions/black-friday' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deepLink?: string;

  @ApiPropertyOptional({ example: 'Shop sale', default: 'Shop now' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  ctaLabel?: string;

  @ApiPropertyOptional({ example: 'UP TO 40% OFF' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  badgeText?: string;

  @ApiProperty({ enum: MarketplacePromotionType, example: MarketplacePromotionType.SEASONAL_SALE })
  @IsEnum(MarketplacePromotionType)
  type!: MarketplacePromotionType;

  @ApiPropertyOptional({ example: '2026-11-27T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @ApiPropertyOptional({ example: '2026-11-30T23:59:59.000Z' })
  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @ApiPropertyOptional({ type: [Number], example: [900, 901] })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(20)
  @IsInt({ each: true })
  @Min(1, { each: true })
  storeProductIds?: number[];
}

export class UpdateMarketplacePromotionDto extends PartialType(CreateMarketplacePromotionDto) {}

export class PromotionListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 15, minimum: 1, maximum: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(15)
  limit = 15;

  @ApiPropertyOptional({ enum: MarketplacePromotionStatus })
  @IsOptional()
  @IsEnum(MarketplacePromotionStatus)
  status?: MarketplacePromotionStatus;

  @ApiPropertyOptional({ enum: MarketplacePromotionType })
  @IsOptional()
  @IsEnum(MarketplacePromotionType)
  type?: MarketplacePromotionType;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  storeId?: number;

  @ApiPropertyOptional({ example: 'Black Friday' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}

export class PublicPromotionListQueryDto extends OmitType(PromotionListQueryDto, [
  'status',
] as const) {}

export class ReviewMarketplacePromotionDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' })
  @IsIn(['APPROVED', 'REJECTED'])
  decision!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'The promotion image contains an unsupported claim.' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
