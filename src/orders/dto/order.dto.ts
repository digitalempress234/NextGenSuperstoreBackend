import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderStatusDto {
  @ApiProperty({
    example: 'PREPARING',
    enum: ['PREPARING', 'READY_FOR_PICKUP'],
    description: 'Vendor/store preparation statuses only.',
  })
  @IsString()
  @IsIn(['PREPARING', 'READY_FOR_PICKUP'])
  status!: string;

  @ApiPropertyOptional({ example: 'Customer requested cancellation.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CancelOrderDto {
  @ApiProperty({ example: 'Ordered by mistake' })
  @IsString()
  @MaxLength(500)
  reason!: string;
}

export class ReturnOrderDto {
  @ApiProperty({ example: 'Item arrived damaged' })
  @IsString()
  @MaxLength(100)
  reason!: string;
  @ApiPropertyOptional({ example: 'The screen is cracked.' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  details?: string;
  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  items?: Array<{ orderItemId: number; quantity: number }>;
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  evidenceUrls?: string[];
}
