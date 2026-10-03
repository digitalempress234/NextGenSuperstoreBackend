import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class ScanOrderQrDto {
  @ApiProperty({ description: 'Raw purse:// QR payload or token' })
  @IsString()
  @MaxLength(2048)
  payload!: string;
}
export class ScanItemDto {
  @ApiProperty() @IsString() @MaxLength(191) code!: string;
  @ApiPropertyOptional({ default: 1 }) @IsOptional() @IsInt() @IsPositive() quantity?: number;
}
