import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';
export class CreateSupportTicketDto {
  @ApiProperty({
    enum: ['GENERAL', 'ORDER', 'DELIVERY', 'DAMAGED_ITEM', 'PAYMENT', 'REFUND'],
    example: 'DELIVERY',
  })
  @IsIn(['GENERAL', 'ORDER', 'DELIVERY', 'DAMAGED_ITEM', 'PAYMENT', 'REFUND'])
  category!: string;
  @ApiProperty({ example: 'Order has not arrived' }) @IsString() @MaxLength(191) subject!: string;
  @ApiProperty({ example: 'The rider has not reached the delivery address.' })
  @IsString()
  @MaxLength(5000)
  description!: string;
  @ApiPropertyOptional({ example: 501 }) @IsOptional() @IsInt() orderId?: number;
  @ApiPropertyOptional({ type: [String], example: ['https://cdn.example.com/evidence/photo.jpg'] })
  @IsOptional()
  @IsArray()
  attachments?: string[];
}
export class UpdateSupportTicketDto {
  @ApiProperty({ enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'], example: 'IN_PROGRESS' })
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status!: string;
  @ApiPropertyOptional({ enum: ['LOW', 'NORMAL', 'HIGH', 'URGENT'], example: 'HIGH' })
  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: string;
}

export class ReplySupportTicketDto {
  @ApiProperty({ example: 'Please share the latest delivery update.' })
  @IsString()
  @MaxLength(5000)
  body!: string;
}

export class SupportTicketListQueryDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'],
    example: 'OPEN',
  })
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status?: string;
}
