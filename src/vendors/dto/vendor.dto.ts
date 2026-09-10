import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class UpdateVendorProfileDto {
  @ApiProperty({
    example: '+2348012345678',
    description: 'Vendor contact phone number',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneNumber?: string;

  @ApiProperty({ example: 'Lagos', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiProperty({ example: 'Ikeja', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @ApiProperty({ example: '12 Allen Avenue', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string;
}

export class VendorNinVerifyDto {
  @ApiProperty({ example: '12345678901', description: '11-digit NIN number' })
  @IsString()
  @MaxLength(11)
  ninNumber!: string;

  @ApiPropertyOptional({
    example: '/9j/4AAQSkZJRgAB...',
    description: 'Base64-encoded selfie image for face-match against NIN record',
  })
  @IsOptional()
  @IsString()
  selfieBase64?: string;
}

export class VendorCacVerifyDto {
  @ApiProperty({
    example: 'RC1234567',
    description: 'Company registration number (RC, BN, or IT prefix)',
  })
  @IsString()
  @Matches(/^(RC|BN|IT)\d+$/i, {
    message: 'regNumber must be in the format RC1234, BN1234, or IT1234',
  })
  regNumber!: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Also run optional TIN verification using the same reg number',
  })
  @IsOptional()
  verifyTin?: boolean;
}
