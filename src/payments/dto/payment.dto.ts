import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsPositive } from 'class-validator';

export class InitializePaymentDto {
  @ApiProperty({ example: 1001, description: 'Checkout payment group created during checkout.' })
  @IsInt()
  @IsPositive()
  paymentGroupId!: number;
}
