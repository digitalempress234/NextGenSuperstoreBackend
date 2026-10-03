import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class TopupWalletDto {
  @ApiProperty({
    minimum: 100,
    maximum: 1000000,
    example: 5000,
    description: 'Amount in NGN to add to the wallet. Minimum ₦100, maximum ₦1,000,000.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  @Max(1000000)
  amount!: number;
}

export class WithdrawWalletDto {
  @ApiProperty({ minimum: 100, example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  amount!: number;

  @ApiProperty({ example: 'GTBank' }) @IsString() @MaxLength(100) bankName!: string;
  @ApiProperty({ example: '0123456789' }) @IsString() @MaxLength(20) accountNumber!: string;
  @ApiProperty({ example: 'Ada Okafor' }) @IsString() @MaxLength(191) accountName!: string;
  @ApiProperty({ enum: ['MANUAL'], default: 'MANUAL' })
  @IsIn(['MANUAL'])
  mode = 'MANUAL' as const;
}

export class CreateWalletTransferAccountDto {
  @ApiProperty({
    example: true,
    description: 'Explicit consent to share identity details with Paystack for account assignment.',
  })
  @Equals(true)
  consent!: true;

  @ApiPropertyOptional({ example: 'titan-paystack' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  preferredBank?: string;
}
