import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const ADMIN_ORDER_STATUSES = [
  'PREPARING',
  'READY_FOR_PICKUP',
  'RIDER_ASSIGNED',
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'COMPLETED',
] as const;

export class AdminUpdateOrderStatusDto {
  @ApiProperty({ enum: ADMIN_ORDER_STATUSES, example: 'COMPLETED' })
  @IsIn(ADMIN_ORDER_STATUSES)
  status!: (typeof ADMIN_ORDER_STATUSES)[number];

  @ApiProperty({
    example: 'Confirmed by operations after reviewing the delivery evidence.',
    description: 'Required audit reason for the exceptional staff intervention.',
  })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class ReviewRiderDto {
  @ApiProperty({ example: 'Documents and identity verification completed.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RejectRiderDto {
  @ApiProperty({ example: 'Motorcycle registration image is unreadable.' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}

export class ReviewDocumentDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' })
  @IsString()
  status!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'Document is clear and valid.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class RiderApplicationDecisionDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'], example: 'APPROVE' })
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({
    default: false,
    description:
      'When approving, atomically approves the pending motorcycle photo/plate and registration evidence reviewed on this screen. Automatic identity, licence, and liveness failures are never overridden.',
  })
  @IsOptional()
  @IsBoolean()
  approvePendingManualChecks?: boolean;

  @ApiProperty({ example: 'Motorcycle photo, plate, and registration reviewed.' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
