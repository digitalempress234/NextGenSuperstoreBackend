import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({
    example: 42,
    description: 'StoreProduct offer ID, not the canonical Product ID.',
  })
  @IsInt()
  @IsPositive()
  storeProductId!: number;

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
