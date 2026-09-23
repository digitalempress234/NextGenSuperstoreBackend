import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateAddressDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(191) label?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) state!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(191) city?: string;
  @ApiPropertyOptional({ description: 'Alias for city.' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  town?: string;
  @ApiProperty() @IsString() @IsNotEmpty() @MaxLength(191) address!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(191) firstName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(191) lastName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @IsNotEmpty() @MaxLength(30) phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(30) additionalPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsEmail() @MaxLength(191) email?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(191) additionalInfo?: string;
  @ApiPropertyOptional() @IsNumber() @Min(-90) @Max(90) @IsOptional() latitude?: number;
  @ApiPropertyOptional() @IsNumber() @Min(-180) @Max(180) @IsOptional() longitude?: number;
  @ApiPropertyOptional() @IsBoolean() @IsOptional() isDefault?: boolean;
}
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
