import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MinLength,
  IsPhoneNumber,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'Tony' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Stark' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  lastName?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  @IsPhoneNumber('NG')
  phoneNumber?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPassword123!' })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class VerifyEmailOtpDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '482931', minLength: 6, maxLength: 6 })
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;
}

export class ResendEmailOtpDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email!: string;
}

export class ForgotPasswordDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '482931', minLength: 6, maxLength: 6 })
  @IsString()
  @Matches(/^\d{6}$/)
  otp!: string;

  @ApiProperty({ example: 'NewStrongPassword456!' })
  @IsString()
  @MinLength(8)
  password!: string;
}
