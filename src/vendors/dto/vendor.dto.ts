import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateVendorProfileDto {
  @ApiProperty({ example: '+2348012345678', description: 'Vendor contact phone number', required: false })
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
