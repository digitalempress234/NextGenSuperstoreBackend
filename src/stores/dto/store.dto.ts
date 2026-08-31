import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateStoreDto {
  @ApiProperty({ example: 'Purse Supermarket Ikeja' })
  @IsString()
  @MaxLength(120)
  storeName!: string;

  @ApiPropertyOptional({ example: 'Neighbourhood supermarket and pickup point.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'store@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '08012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ example: 'Lagos' })
  @IsString()
  state!: string;

  @ApiProperty({ example: 'Ikeja' })
  @IsString()
  city!: string;

  @ApiProperty({ example: '12 Allen Avenue' })
  @IsString()
  address!: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/demo/image/upload/store.jpg' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ example: 6.6018 })
  @IsOptional()
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional({ example: 3.3515 })
  @IsOptional()
  @IsNumber()
  longitude?: number;
}

export class UpdateStoreDto extends PartialType(CreateStoreDto) {}

export class UpsertStoreProductDto {
  @ApiProperty({ example: 42 })
  @IsInt()
  @IsPositive()
  productId!: number;

  @ApiPropertyOptional({ example: 'IGA-COKE-500' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ example: 950 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  price!: number;

  @ApiPropertyOptional({ example: 850 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  discountPrice?: number;

  @ApiPropertyOptional({ enum: ['PERCENTAGE', 'FIXED'], example: 'FIXED' })
  @IsOptional()
  @IsString()
  discountType?: 'PERCENTAGE' | 'FIXED';

  @ApiProperty({ example: 120 })
  @IsInt()
  stockQuantity!: number;
}

export class SubmitCacDto {
  @ApiProperty({
    example: 'RC123456',
    description:
      'Company registration number issued by the Corporate Affairs Commission. ' +
      'Format: RC<digits> for a limited company, BN<digits> for a business name, ' +
      'IT<digits> for an incorporated trustee.',
  })
  @IsString()
  @Matches(/^(RC|BN|IT)\d+$/i, {
    message: 'regNumber must start with RC, BN, or IT followed by digits (e.g. RC123456).',
  })
  regNumber!: string;
}
