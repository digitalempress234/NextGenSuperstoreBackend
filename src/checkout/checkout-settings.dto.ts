import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class PickupStationDto {
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) address!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) state!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) city!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(30) phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ obj, key }) => obj[key])
  @IsBoolean()
  isActive?: boolean;
}
export class UpdatePickupStationDto extends PartialType(PickupStationDto, {
  skipNullProperties: false,
}) {}

export class CheckoutSettingsDto {
  @ApiProperty({ minimum: 0, description: 'NGN delivery fee charged once per store order.' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(10000000)
  deliveryFeePerStore!: number;
  @ApiProperty() @Transform(({ obj, key }) => obj[key]) @IsBoolean() deliveryEnabled!: boolean;
  @ApiProperty() @Transform(({ obj, key }) => obj[key]) @IsBoolean() opayEnabled!: boolean;
}
export class BnplPlanDto {
  @ApiProperty({ enum: ['nextgen_purse', 'easybuy', 'wallet_bnpl'] })
  @IsIn(['nextgen_purse', 'easybuy', 'wallet_bnpl'])
  provider!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) label!: string;
  @ApiProperty({ minimum: 1, maximum: 60 }) @IsInt() @Min(1) @Max(60) months!: number;
  @ApiProperty({ description: 'Flat percentage on the financed total.', minimum: 0, maximum: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  interestRate!: number;
  @ApiProperty() @Transform(({ obj, key }) => obj[key]) @IsBoolean() isActive!: boolean;
}
export class UpdateBnplPlanDto extends PartialType(BnplPlanDto, { skipNullProperties: false }) {}
