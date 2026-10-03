import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, Min } from 'class-validator';

export class RiderWithdrawDto {
  @ApiProperty({ example: 5000, minimum: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  amount!: number;

  @ApiProperty({ enum: ['MANUAL', 'AUTO'], example: 'MANUAL' })
  @IsIn(['MANUAL', 'AUTO'])
  mode!: 'MANUAL' | 'AUTO';
}
