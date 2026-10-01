import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const RIDER_REPORTED_STATUSES: DeliveryStatus[] = [
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'FAILED',
  'CANCELLED',
];

export class UpdateDeliveryStatusDto {
  @ApiProperty({
    enum: RIDER_REPORTED_STATUSES,
    example: 'IN_TRANSIT',
    description:
      'PICKED_UP and DELIVERED are intentionally excluded; both handoffs require QR verification.',
  })
  @IsIn(RIDER_REPORTED_STATUSES)
  status!: DeliveryStatus;

  @ApiPropertyOptional({ example: 'Ikeja, Lagos' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  location?: string;

  @ApiPropertyOptional({ example: 'Heavy traffic' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
