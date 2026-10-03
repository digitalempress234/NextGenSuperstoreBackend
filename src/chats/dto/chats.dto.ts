import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';

export class CreateChatDto {
  @ApiProperty({ example: 12 }) @IsInt() @IsPositive() storeId!: number;
  @ApiPropertyOptional({ example: 501 }) @IsOptional() @IsInt() @IsPositive() orderId?: number;
}
export class SendChatMessageDto {
  @ApiProperty({ example: 'Hello, when will my order be ready?' })
  @IsString()
  @MaxLength(4000)
  body!: string;
  @ApiPropertyOptional({ example: 'mobile-msg-1738573200' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  clientMessageId?: string;
}
