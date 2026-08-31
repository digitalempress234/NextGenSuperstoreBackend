import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsInt, IsObject, IsOptional, IsString } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty({ example: 101 })
  @IsInt()
  userId!: number;

  @ApiProperty({ example: 'OPERATIONS_ADMIN' })
  @IsString()
  roleName!: string;

  @ApiPropertyOptional({ example: '2027-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class PermissionOverrideDto {
  @ApiProperty({ example: 101 })
  @IsInt()
  userId!: number;

  @ApiProperty({ example: 'reports.export' })
  @IsString()
  permissionKey!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  granted!: boolean;

  @ApiProperty({ example: 'Quarterly audit project' })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({ example: 'STORE' })
  @IsOptional()
  @IsString()
  scopeType?: string;

  @ApiPropertyOptional({ example: '42' })
  @IsOptional()
  @IsString()
  scopeId?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class CreateApprovalRequestDto {
  @ApiProperty({ example: 'orders.refund.approve' })
  @IsString()
  actionKey!: string;

  @ApiProperty({ example: 'ORDER' })
  @IsString()
  resourceType!: string;

  @ApiProperty({ example: '9812' })
  @IsString()
  resourceId!: string;

  @ApiPropertyOptional({ example: 'Refund requested by customer after duplicate charge.' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ example: { amount: 45000 }, type: Object })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}

export class DecideApprovalDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' })
  @IsString()
  status!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'Approved after payment reconciliation.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
