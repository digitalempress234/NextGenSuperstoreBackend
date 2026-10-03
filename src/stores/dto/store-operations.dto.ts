import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StoreCampaignDto {
  @ApiProperty({ example: 'WEEKEND10' }) @IsString() @MaxLength(64) code!: string;
  @ApiProperty({
    enum: ['FREE_SHIPPING', 'STORE_DEAL', 'PERCENTAGE', 'FIXED'],
    example: 'PERCENTAGE',
  })
  @IsIn(['FREE_SHIPPING', 'STORE_DEAL', 'PERCENTAGE', 'FIXED'])
  type!: string;
  @ApiProperty({ example: 'Weekend grocery discount' }) @IsString() @MaxLength(191) title!: string;
  @ApiPropertyOptional({ example: 'Save 10% this weekend' })
  @IsOptional()
  @IsString()
  subtitle?: string;
  @ApiPropertyOptional({ example: 'Applies to orders of ₦10,000 or more.' })
  @IsOptional()
  @IsString()
  description?: string;
  @ApiPropertyOptional({ example: 10000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumOrderAmount?: number;
  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountPercent?: number;
  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  discountAmount?: number;
  @ApiPropertyOptional({ example: '2026-10-03T00:00:00.000Z' })
  @IsOptional()
  @IsString()
  startsAt?: string;
  @ApiPropertyOptional({ example: '2026-10-31T23:59:59.000Z' })
  @IsOptional()
  @IsString()
  expiresAt?: string;
  @ApiPropertyOptional({ example: true }) @IsOptional() @IsBoolean() isActive?: boolean;
}

export class StoreOrderQueryDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 15, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 15;
  @ApiPropertyOptional({ example: 'PREPARING' }) @IsOptional() @IsString() status?: string;
}
