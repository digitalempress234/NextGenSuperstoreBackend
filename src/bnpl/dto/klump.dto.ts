import { ApiProperty, OmitType } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { CreateCheckoutDto } from '../../checkout/dto/checkout.dto';

export class InitializeKlumpCheckoutDto extends OmitType(CreateCheckoutDto, [
  'paymentMethod',
] as const) {}

export class VerifyKlumpTransactionDto {
  @ApiProperty({ example: 'KLP-1644-083962-4231' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  reference!: string;
}

export class CompleteKlumpRefundDto {
  @ApiProperty({
    example: 'KLP-REFUND-12345',
    description: 'Reference copied from the completed manual refund in the Klump dashboard.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(191)
  providerReference!: string;
}
