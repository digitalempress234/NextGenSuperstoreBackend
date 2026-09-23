import { Transform, Type } from 'class-transformer';
import {
  Equals,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, OmitType } from '@nestjs/swagger';
import { CreateCheckoutDto } from '../checkout/dto/checkout.dto';

export class BnplPlansQuery {
  @ApiProperty({ enum: ['nextgen_purse', 'easybuy', 'wallet_bnpl'] })
  @IsIn(['nextgen_purse', 'easybuy', 'wallet_bnpl'])
  provider!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @IsPositive() cartId!: number;
}
export class ApplyBnplDto extends OmitType(CreateCheckoutDto, [
  'cartId',
  'deliveryMethod',
  'paymentMethod',
  'fulfillmentType',
  'address',
] as const) {
  @ApiProperty() @Type(() => Number) @IsInt() @IsPositive() cartId!: number;
  @ApiProperty({ enum: ['home_delivery', 'store_pickup'] })
  @IsIn(['home_delivery', 'store_pickup'])
  deliveryMethod!: 'home_delivery' | 'store_pickup';
  @ApiProperty({ enum: ['nextgen_purse', 'easybuy', 'wallet_bnpl'] })
  @IsIn(['nextgen_purse', 'easybuy', 'wallet_bnpl'])
  provider!: string;
  @ApiProperty() @Type(() => Number) @IsInt() @IsPositive() planId!: number;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) employerName!: string;
  @ApiProperty()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monthlyIncome!: number;
  @ApiProperty({ pattern: '^\\d{10}$' }) @IsString() @Matches(/^\d{10}$/) accountNumber!: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) bankName!: string;
  @ApiProperty({ enum: [true] })
  @Transform(({ obj }) => obj.nibssConsent === true || obj.nibssConsent === 'true')
  @Equals(true)
  nibssConsent!: boolean;
}
export class ConfirmBnplDto {
  @ApiProperty() @Type(() => Number) @IsInt() @IsPositive() applicationId!: number;
}
export class ReviewBnplDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'] }) @IsIn(['APPROVED', 'REJECTED']) status!:
    'APPROVED' | 'REJECTED';
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) reason!: string;
}
