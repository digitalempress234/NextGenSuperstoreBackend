import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Beverages' })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ example: null })
  @IsOptional()
  @IsInt()
  parentId?: number;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Coca-Cola 50cl' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Coca-Cola' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ example: '5449000000996' })
  @IsOptional()
  @IsString()
  barcode?: string;

  @ApiPropertyOptional({ example: 'Carbonated soft drink.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: '500ml' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ example: 4 })
  @IsInt()
  categoryId!: number;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  status?: boolean;

  @ApiPropertyOptional({ example: ['https://res.cloudinary.com/demo/image/upload/coke.jpg'], type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];
}

export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductSearchDto {
  @ApiPropertyOptional({ example: 'coke' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  categoryId?: number;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  limit = 20;
}
