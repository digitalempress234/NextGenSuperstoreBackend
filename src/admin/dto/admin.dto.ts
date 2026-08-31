import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class ReviewRiderDto {
  @ApiProperty({ example: 'Documents and identity verification completed.' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewDocumentDto {
  @ApiProperty({ enum: ['APPROVED', 'REJECTED'], example: 'APPROVED' })
  @IsString()
  status!: 'APPROVED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'Document is clear and valid.' })
  @IsOptional()
  @IsString()
  reason?: string;
}
