import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateDeliveryLocationDto {
  @ApiProperty({ example: 6.524379 })
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 3.379206 })
  @IsLongitude()
  longitude!: number;

  @ApiPropertyOptional({ example: 8.5, description: 'Horizontal accuracy in metres.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5000)
  accuracyM?: number;

  @ApiPropertyOptional({ example: 32.4, description: 'Current speed in km/h.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  speedKph?: number;

  @ApiPropertyOptional({ example: 180, description: 'Heading in degrees, 0-360.' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  headingDeg?: number;

  @ApiPropertyOptional({ example: 84, description: 'Rider device battery percentage.' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  batteryLevel?: number;

  @ApiPropertyOptional({ example: 'GPS', description: 'Client-provided source label.' })
  @IsOptional()
  @IsString()
  source?: string;
}

export class DeliveryTrackingHistoryQueryDto {
  @ApiPropertyOptional({ example: 100, default: 100, minimum: 1, maximum: 500 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}
