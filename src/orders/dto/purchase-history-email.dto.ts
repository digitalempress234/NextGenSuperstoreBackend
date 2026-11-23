import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class PurchaseHistoryEmailDto {
  @ApiPropertyOptional({
    description: 'Attachment format. CSV remains the default for backward compatibility.',
    enum: ['csv', 'pdf', 'both'],
    default: 'csv',
    example: 'pdf',
  })
  @IsOptional()
  @IsIn(['csv', 'pdf', 'both'])
  format?: 'csv' | 'pdf' | 'both';

  @ApiPropertyOptional({
    description: 'Optional inclusive start of the purchase period in ISO 8601 format.',
    example: '2026-01-01',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    description:
      'Optional inclusive end of the purchase period in ISO 8601 format. A date without a time includes that entire day.',
    example: '2026-11-21',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}
