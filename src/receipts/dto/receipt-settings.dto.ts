import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class ReceiptEmailSettingsDto {
  @ApiProperty({
    example: true,
    default: true,
    description:
      'When enabled, every issued or resent customer receipt email includes its branded PDF copy.',
  })
  @IsBoolean()
  attachPdfToEmail!: boolean;
}
