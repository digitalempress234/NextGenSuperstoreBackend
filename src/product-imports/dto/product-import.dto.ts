import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductImportStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { PaginationDto } from '../../common/dto/pagination.dto';

export class ProductImportQueryDto extends PaginationDto {
  @ApiPropertyOptional({ enum: ProductImportStatus, example: ProductImportStatus.READY })
  @IsOptional()
  @IsEnum(ProductImportStatus)
  status?: ProductImportStatus;
}

export class AdminProductImportQueryDto extends ProductImportQueryDto {
  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  storeId?: number;
}

export enum ProductImportDecision {
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
}

export class ProductImportRowDecisionDto {
  @ApiProperty({ example: 901 })
  @Type(() => Number)
  @IsInt()
  rowId!: number;

  @ApiProperty({ enum: ProductImportDecision, example: ProductImportDecision.APPROVE })
  @IsEnum(ProductImportDecision)
  decision!: ProductImportDecision;

  @ApiPropertyOptional({ example: 'The product image is missing.' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ReviewProductImportDto {
  @ApiProperty({ type: [ProductImportRowDecisionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => ProductImportRowDecisionDto)
  rows!: ProductImportRowDecisionDto[];
}
