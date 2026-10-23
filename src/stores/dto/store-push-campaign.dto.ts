import { IsEnum, IsISO8601, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { PushCampaignApprovalStatus, PushCampaignStatus } from '@prisma/client';

import { CreatePushCampaignDto } from '../../admin/dto/push-campaign.dto';

export class CreateStorePushCampaignDto extends OmitType(CreatePushCampaignDto, [
  'audience',
] as const) {}

export class UpdateStorePushCampaignDto extends PartialType(CreateStorePushCampaignDto) {}

export class ScheduleStorePushCampaignDto {
  @ApiProperty({ example: '2026-10-24T09:00:00.000Z' })
  @IsISO8601()
  scheduledAt!: string;
}

export class StorePushCampaignListQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 15, default: 15, minimum: 1, maximum: 15 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(15)
  limit?: number = 15;

  @ApiPropertyOptional({ enum: PushCampaignStatus })
  @IsOptional()
  @IsEnum(PushCampaignStatus)
  status?: PushCampaignStatus;

  @ApiPropertyOptional({ enum: PushCampaignApprovalStatus })
  @IsOptional()
  @IsEnum(PushCampaignApprovalStatus)
  approvalStatus?: PushCampaignApprovalStatus;
}
