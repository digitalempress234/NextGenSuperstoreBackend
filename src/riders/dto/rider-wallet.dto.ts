import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNumber, IsOptional, Min } from 'class-validator';

export class RiderWithdrawDto {
  @ApiProperty({ example: 5000, minimum: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  amount!: number;

  @ApiProperty({ enum: ['MANUAL', 'AUTO'], example: 'MANUAL' })
  @IsIn(['MANUAL', 'AUTO'])
  mode!: 'MANUAL' | 'AUTO';

  @ApiPropertyOptional({
    example: 1,
    description:
      'Verified payout account to use. When omitted, the rider primary bank account is used.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  bankAccountId?: number;
}
