import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { PaginationDto } from '../../common/dto/pagination.dto';

export class ListOrdersDto extends PaginationDto {
  @ApiPropertyOptional({
    enum: ['all', 'pending', 'in_progress', 'ready_for_pickup', 'delivered', 'cancelled'],
  })
  @IsOptional()
  @IsIn(['all', 'pending', 'in_progress', 'ready_for_pickup', 'delivered', 'cancelled'])
  status?: 'all' | 'pending' | 'in_progress' | 'ready_for_pickup' | 'delivered' | 'cancelled';
}
