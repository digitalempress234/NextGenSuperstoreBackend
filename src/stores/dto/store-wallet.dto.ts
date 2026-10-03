import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsString, MaxLength, Min } from 'class-validator';

export class StoreWithdrawDto {
  @ApiProperty({ example: 5000, minimum: 100 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  amount!: number;

  @ApiProperty({ example: 'Guaranty Trust Bank' })
  @IsString()
  @MaxLength(100)
  bankName!: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @MaxLength(20)
  accountNumber!: string;

  @ApiProperty({ example: 'Bola Adeyemi' })
  @IsString()
  @MaxLength(191)
  accountName!: string;

  @ApiProperty({ enum: ['MANUAL', 'AUTO'], example: 'MANUAL' })
  @IsIn(['MANUAL', 'AUTO'])
  mode!: 'MANUAL' | 'AUTO';
}
