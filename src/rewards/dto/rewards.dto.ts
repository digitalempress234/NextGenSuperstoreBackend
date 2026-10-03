import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RedeemCashbackDto {
  @ApiProperty({ example: '5000.00' })
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/)
  amount!: string;
}

export class SaveVoucherDto {
  @ApiProperty() @IsString() @MaxLength(64) code!: string;
  @ApiProperty({ enum: ['FREE_SHIPPING', 'STORE_DEAL', 'PERCENTAGE', 'FIXED'] })
  @IsIn(['FREE_SHIPPING', 'STORE_DEAL', 'PERCENTAGE', 'FIXED'])
  type!: string;
  @ApiProperty() @IsString() @MaxLength(191) title!: string;
  @IsOptional() @IsString() subtitle?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumOrderAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountPercent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) discountAmount?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) pointsCost?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) giveawayEntries?: number;
  @IsOptional() @Type(() => Number) @IsInt() storeId?: number;
  @IsOptional() @IsString() expiresAt?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ApplyVoucherDto {
  @ApiProperty({ example: 'rew-ship-01', description: 'Voucher ID or code' })
  @IsString()
  @IsNotEmpty()
  voucher!: string;
}
