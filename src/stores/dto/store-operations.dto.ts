import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class StoreCampaignDto {
  @ApiProperty() @IsString() @MaxLength(64) code!: string;
  @ApiProperty({ enum: ['FREE_SHIPPING', 'STORE_DEAL', 'PERCENTAGE', 'FIXED'] })
  @IsIn(['FREE_SHIPPING', 'STORE_DEAL', 'PERCENTAGE', 'FIXED'])
  type!: string;
  @ApiProperty() @IsString() @MaxLength(191) title!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() subtitle?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumOrderAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountPercent?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() startsAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiresAt?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class StoreOrderQueryDto {
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @ApiPropertyOptional({ default: 15, maximum: 100 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 15;
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
}
