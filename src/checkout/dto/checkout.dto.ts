import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsObject, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';

export class CheckoutAddressDto {
  @ApiPropertyOptional({ example: 'Home' })
  @IsOptional()
  @IsString()
  label?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiProperty({ example: '12 Allen Avenue, Ikeja' })
  @IsString()
  address!: string;
}

export class CreateCheckoutDto {
  @ApiProperty({ enum: ['PICKUP', 'DELIVERY'], example: 'DELIVERY' })
  @IsIn(['PICKUP', 'DELIVERY'])
  fulfillmentType!: 'PICKUP' | 'DELIVERY';

  @ApiPropertyOptional({ type: CheckoutAddressDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CheckoutAddressDto)
  address?: CheckoutAddressDto;

  @ApiPropertyOptional({ example: 1500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  deliveryFee?: number;
}
