import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
export class CreateSupportTicketDto {
  @ApiProperty({ enum: ['GENERAL', 'ORDER', 'DELIVERY', 'DAMAGED_ITEM', 'PAYMENT', 'REFUND'] })
  @IsIn(['GENERAL', 'ORDER', 'DELIVERY', 'DAMAGED_ITEM', 'PAYMENT', 'REFUND'])
  category!: string;
  @ApiProperty() @IsString() @MaxLength(191) subject!: string;
  @ApiProperty() @IsString() @MaxLength(5000) description!: string;
  @ApiPropertyOptional() @IsOptional() @IsInt() orderId?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() attachments?: string[];
}
export class UpdateSupportTicketDto {
  @ApiProperty({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] })
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status!: string;
  @ApiPropertyOptional({ enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'] })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;
}

export class ReplySupportTicketDto {
  @ApiProperty() @IsString() @MaxLength(5000) body!: string;
}
