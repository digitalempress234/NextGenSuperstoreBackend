import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateRiderAvailabilityDto {
  @ApiProperty({
    example: true,
    description:
      'Set to true to appear online and browse available delivery jobs. Only operationally approved riders may go online.',
  })
  @IsBoolean()
  isOnline!: boolean;
}
