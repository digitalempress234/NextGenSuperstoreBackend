import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsPositive, IsString, MaxLength } from 'class-validator';
export class CreateChatDto {
  @ApiProperty() @IsInt() @IsPositive() storeId!: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @IsPositive() orderId?: number;
}
export class SendChatMessageDto {
  @ApiProperty() @IsString() @MaxLength(4000) body!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(100) clientMessageId?: string;
}
