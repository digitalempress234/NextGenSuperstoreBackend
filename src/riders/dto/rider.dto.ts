import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRiderProfileDto {
  @ApiPropertyOptional({ example: 'Ikeja / Allen Avenue' })
  @IsOptional()
  @IsString()
  areaOfOperation?: string;

  @ApiPropertyOptional({ example: 'Tony Logistics' })
  @IsOptional()
  @IsString()
  businessName?: string;

  @ApiPropertyOptional({ example: 'Lagos' })
  @IsOptional()
  @IsString()
  businessState?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @IsOptional()
  @IsString()
  businessCity?: string;

  @ApiPropertyOptional({ example: '12 Allen Avenue' })
  @IsOptional()
  @IsString()
  businessAddress?: string;

  @ApiPropertyOptional({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional({ example: '+2348099999999' })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional({ example: 'Jane Doe' })
  @IsOptional()
  @IsString()
  nextOfKinName?: string;

  @ApiPropertyOptional({ example: '+2348088888888' })
  @IsOptional()
  @IsString()
  nextOfKinPhone?: string;
}

export class CreateRiderDocumentDto {
  @ApiProperty({
    example: 'NIN',
    enum: [
      'NIN',
      'NIN_SLIP',
      'NATIONAL_ID',
      'DRIVERS_LICENSE',
      'INTERNATIONAL_PASSPORT',
      'VOTERS_CARD',
      'PASSPORT_PHOTO',
    ],
  })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ example: '12345678901' })
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiProperty({ example: 'https://res.cloudinary.com/demo/image/upload/kyc/nin.jpg' })
  @IsString()
  url!: string;

  @ApiPropertyOptional({ example: 'purse/kyc/nin-01' })
  @IsOptional()
  @IsString()
  publicId?: string;

  @ApiPropertyOptional({ example: '2029-08-25T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class CreateVehicleDto {
  @ApiProperty({ example: 'MOTORCYCLE' })
  @IsString()
  type!: string;

  @ApiPropertyOptional({ example: 'Honda' })
  @IsOptional()
  @IsString()
  make?: string;

  @ApiPropertyOptional({ example: 'CB125' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ example: 2024 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number;

  @ApiPropertyOptional({ example: 'Black' })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ example: 'LAG-123-XY' })
  @IsString()
  plateNumber!: string;

  @ApiPropertyOptional({ example: 'REG-2024-12345' })
  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @ApiProperty({ enum: ['OWNED', 'AUTHORIZED_TO_USE', 'LEASED'], example: 'OWNED' })
  @IsEnum(['OWNED', 'AUTHORIZED_TO_USE', 'LEASED'] as const)
  ownershipType!: 'OWNED' | 'AUTHORIZED_TO_USE' | 'LEASED';

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/demo/image/upload/vehicle.jpg' })
  @IsOptional()
  @IsString()
  photoUrl?: string;
}

export class CreateBankAccountDto {
  @ApiProperty({ example: '058' })
  @IsString()
  bankCode!: string;

  @ApiPropertyOptional({
    example: 'GTBank',
    description:
      'Displayed for confirmation only. Backend resolves the official bank name from Paystack using bankCode.',
  })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  accountNumber!: string;

  @ApiPropertyOptional({
    example: 'Tony Stark',
    description:
      'Optional on create; backend resolves it from Paystack before persisting when omitted.',
  })
  @IsOptional()
  @IsString()
  accountName?: string;

  @ApiPropertyOptional({ example: true, default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class CreateGuarantorDto {
  @ApiProperty({ example: 'John Guarantor' })
  @IsString()
  fullName!: string;

  @ApiProperty({ example: '+2348011111111' })
  @IsString()
  phone!: string;

  @ApiProperty({ example: 'Brother' })
  @IsString()
  relationship!: string;

  @ApiPropertyOptional({ example: '45 GRA, Ikeja, Lagos' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'https://res.cloudinary.com/demo/image/upload/guarantor.jpg' })
  @IsOptional()
  @IsString()
  photographUrl?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// QoreID KYC DTOs
// Appended below — original DTOs above are untouched.
// ─────────────────────────────────────────────────────────────────────────────

export class MintKycSessionDto {
  @ApiProperty({
    example: 'liveness',
    description: 'QoreID product code for the SDK session (e.g. "liveness").',
  })
  @IsString()
  productCode!: string;

  @ApiProperty({
    example: 'rider-onboard-1001-1725000000',
    description: 'Your internal transaction reference for this session.',
  })
  @IsString()
  reference!: string;

  @ApiPropertyOptional({
    example: 120,
    description: 'Optional token lifetime in seconds (server-capped by QoreID).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(10)
  ttlSeconds?: number;
}

export class VerifyRiderDocumentDto {
  @ApiProperty({ example: 10, description: 'ID of the RiderDocument record to verify.' })
  @Type(() => Number)
  @IsInt()
  documentId!: number;

  @ApiPropertyOptional({
    example: '/9j/4AAQSkZJRgAB...',
    description:
      'Optional base64-encoded selfie for face-match. When provided, the face-verification endpoint is also called.',
  })
  @IsOptional()
  @IsString()
  selfieBase64?: string;
}

export class VerifyGuarantorDocumentDto {
  @ApiProperty({ example: 5, description: 'ID of the GuarantorDocument record to verify.' })
  @Type(() => Number)
  @IsInt()
  documentId!: number;
}
