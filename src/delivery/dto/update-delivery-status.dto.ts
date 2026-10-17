import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DeliveryStatus } from '@prisma/client';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

const RIDER_REPORTED_STATUSES: DeliveryStatus[] = [
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'ARRIVED_AT_CUSTOMER',
  'FAILED',
  'CANCELLED',
];

export class UpdateDeliveryStatusDto {
  @ApiProperty({
    enum: RIDER_REPORTED_STATUSES,
    example: 'ARRIVED_AT_CUSTOMER',
    description:
      'Use ARRIVED_AT_CUSTOMER when the rider reaches the delivery address. The state is persisted so the app can restore its delivery-confirmation modal after a restart. PICKED_UP and DELIVERED are intentionally excluded; both handoffs require QR verification.',
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
