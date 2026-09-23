import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class CheckoutAddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() label?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() state?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() city?: string;
  @ApiProperty() @IsString() @IsNotEmpty() address!: string;
}

export class CreateCheckoutDto {
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() cartId?: number;
  @ApiPropertyOptional({ enum: ['PICKUP', 'DELIVERY'] })
  @IsOptional()
  @IsIn(['PICKUP', 'DELIVERY'])
  fulfillmentType?: 'PICKUP' | 'DELIVERY';
  @ApiPropertyOptional({ enum: ['home_delivery', 'store_pickup'] })
  @IsOptional()
  @IsIn(['home_delivery', 'store_pickup'])
  deliveryMethod?: 'home_delivery' | 'store_pickup';
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() addressId?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() pickupStationId?: number;
  @ApiPropertyOptional({ type: CheckoutAddressDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  address?: CheckoutAddressDto;
  @ApiPropertyOptional({ enum: ['card', 'opay', 'wallet'], default: 'card' })
  @IsOptional()
  @IsIn(['card', 'opay', 'wallet'])
  paymentMethod?: 'card' | 'opay' | 'wallet';
}

export class PlaceOrderDto extends OmitType(CreateCheckoutDto, [
  'cartId',
  'deliveryMethod',
  'paymentMethod',
  'fulfillmentType',
  'address',
] as const) {
  @ApiProperty() @IsInt() @IsPositive() cartId!: number;
  @ApiProperty({ enum: ['home_delivery', 'store_pickup'] })
  @IsIn(['home_delivery', 'store_pickup'])
  deliveryMethod!: 'home_delivery' | 'store_pickup';
  @ApiProperty({ enum: ['card', 'opay', 'wallet'] })
  @IsIn(['card', 'opay', 'wallet'])
  paymentMethod!: 'card' | 'opay' | 'wallet';
}
