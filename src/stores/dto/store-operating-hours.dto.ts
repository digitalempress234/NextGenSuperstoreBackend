import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class StoreOperatingHourDto {
  @ApiProperty({ example: 1, description: 'Day of week: 0 = Sunday, 6 = Saturday.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiPropertyOptional({ example: '08:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  opensAt?: string;

  @ApiPropertyOptional({ example: '20:00' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  closesAt?: string;

  @ApiPropertyOptional({ example: false, default: false })
  @IsOptional()
  @IsBoolean()
  isClosed = false;
}

export class UpdateStoreOperatingHoursDto {
  @ApiPropertyOptional({ example: 'Africa/Lagos' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({
    example: '2026-11-14T18:00:00.000Z',
    nullable: true,
    description: 'Temporarily close the store until this instant. Send null to reopen it.',
  })
  @IsOptional()
  @IsISO8601()
  temporarilyClosedUntil?: string | null;

  @ApiProperty({ type: [StoreOperatingHourDto] })
  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => StoreOperatingHourDto)
  hours!: StoreOperatingHourDto[];
}
