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

export class MintKycSessionDto {
  @ApiProperty({
    example: 'FACE_LIVENESS_NIN',
    description:
      'Identro liveness service type. Use FACE_LIVENESS_ONLY for liveness-only, FACE_LIVENESS_NIN to also match against a NIN record.',
    enum: ['FACE_LIVENESS_ONLY', 'FACE_LIVENESS_NIN', 'FACE_LIVENESS_BVN', 'FACE_LIVENESS_REFERENCE'],
  })
  @IsString()
  serviceType!: string;

  @ApiProperty({
    example: 'NIN',
    description: 'Source type for the liveness check.',
    enum: ['NIN', 'BVN', 'UPLOADED_REFERENCE'],
  })
  @IsString()
  sourceType!: string;

  @ApiPropertyOptional({
    example: '27801936116',
    description: 'Required when sourceType is NIN.',
  })
  @IsOptional()
  @IsString()
  nin?: string;

  @ApiPropertyOptional({
    example: 'RIDER-CONSENT-001',
    description: 'Optional consent reference for audit trail.',
  })
  @IsOptional()
  @IsString()
  consentReference?: string;

  @ApiPropertyOptional({
    example: 'LIVE-RIDER-1001',
    description: 'Optional idempotency key.',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
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
