import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsPositive, IsOptional, ValidateIf } from 'class-validator';

export class AddCartItemDto {
  @ApiPropertyOptional({
    example: 42,
    description: 'StoreProduct offer ID, not the canonical Product ID.',
  })
  @ValidateIf(
    (dto: AddCartItemDto) => dto.storeProductId !== undefined || dto.productId === undefined,
  )
  @IsInt()
  @IsPositive()
  storeProductId?: number;

  @ApiPropertyOptional({
    description: 'Canonical product ID. Include storeId when several stores sell it.',
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  productId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @IsPositive()
  storeId?: number;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @IsPositive()
  quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ example: 3, minimum: 1 })
  @IsInt()
  @IsPositive()
  quantity!: number;
}
