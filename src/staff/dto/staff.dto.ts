import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsPhoneNumber,
  IsString,
  MinLength,
} from 'class-validator';
import { StaffRole } from '@prisma/client';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export class StaffLoginDto {
  @ApiProperty({ example: 'admin@purse.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Password123!' })
  @IsString()
  password!: string;
}

export class StaffChangePasswordDto {
  @ApiProperty({ example: 'Temp@1234' })
  @IsString()
  currentPassword!: string;

  @ApiProperty({ example: 'NewSecure@9876' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export class CreateStaffUserDto {
  @ApiProperty({ example: 'jane.doe@purse.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Jane' })
  @IsString()
  firstName!: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  lastName!: string;

  @ApiProperty({ enum: StaffRole, example: StaffRole.OPERATIONS_ADMIN })
  @IsEnum(StaffRole)
  role!: StaffRole;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsPhoneNumber('NG')
  phoneNumber?: string;
}

export class UpdateStaffUserDto {
  @ApiPropertyOptional({ enum: StaffRole, example: StaffRole.FINANCE_ADMIN })
  @IsOptional()
  @IsEnum(StaffRole)
  role?: StaffRole;

  @ApiPropertyOptional({ example: 'Jane' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Smith' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE', 'SUSPENDED'], example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED';

  @ApiPropertyOptional({ example: '+2348099887766' })
  @IsOptional()
  @IsPhoneNumber('NG')
  phoneNumber?: string;
}
