import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({
    example: 'CONFIRMED',
    enum: [
      'CONFIRMED',
      'PREPARING',
      'READY_FOR_PICKUP',
      'RIDER_ASSIGNED',
      'OUT_FOR_DELIVERY',
      'PICKED_UP',
      'DELIVERED',
      'COMPLETED',
      'CANCELLED',
    ],
  })
  @IsString()
  @IsIn([
    'CONFIRMED',
    'PREPARING',
    'READY_FOR_PICKUP',
    'RIDER_ASSIGNED',
    'OUT_FOR_DELIVERY',
    'PICKED_UP',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
  ])
  status!: string;

  @ApiPropertyOptional({ example: 'Customer requested cancellation.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
