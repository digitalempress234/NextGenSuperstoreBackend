import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsEnum,
  IsISO8601,
  IsInt,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  PushCampaignApprovalStatus,
  PushCampaignAudienceType,
  PushCampaignStatus,
} from '@prisma/client';

const ADMIN_PUSH_CAMPAIGN_AUDIENCES = [
  PushCampaignAudienceType.ALL_USERS,
  PushCampaignAudienceType.CUSTOMERS,
  PushCampaignAudienceType.RIDERS,
  PushCampaignAudienceType.VENDORS,
  PushCampaignAudienceType.SELECTED_USERS,
] as const;

export class PushCampaignAudienceDto {
  @ApiProperty({
    enum: ADMIN_PUSH_CAMPAIGN_AUDIENCES,
    example: PushCampaignAudienceType.CUSTOMERS,
  })
  @IsIn(ADMIN_PUSH_CAMPAIGN_AUDIENCES)
  type!: PushCampaignAudienceType;

  @ApiPropertyOptional({
    type: [Number],
    example: [8, 15, 21],
    description: 'Required only when type is SELECTED_USERS.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @ArrayMaxSize(1000)
  @IsInt({ each: true })
  @Min(1, { each: true })
  userIds?: number[];

  @ApiPropertyOptional({ example: 'Oyo', description: 'Optional address/profile state filter.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  state?: string;

  @ApiPropertyOptional({ example: 'Ibadan', description: 'Optional address/profile city filter.' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;
}

export class CreatePushCampaignDto {
  @ApiProperty({ example: 'Weekend delivery offer' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  title!: string;

  @ApiProperty({ example: 'Order this weekend and enjoy free delivery on eligible products.' })
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  message!: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/campaigns/weekend-offer.jpg' })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  @MaxLength(2000)
  imageUrl?: string;

  @ApiPropertyOptional({
    example: 'superstore://campaigns/weekend-offer',
    description: 'App route or HTTPS URL opened when the notification is tapped.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  deepLink?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  includeInApp?: boolean = true;

  @ApiProperty({ type: PushCampaignAudienceDto })
  @ValidateNested()
  @Type(() => PushCampaignAudienceDto)
  audience!: PushCampaignAudienceDto;
}

export class UpdatePushCampaignDto extends PartialType(CreatePushCampaignDto) {}

export class SchedulePushCampaignDto {
  @ApiProperty({ example: '2026-10-20T09:00:00.000Z' })
  @IsISO8601()
  scheduledAt!: string;
}

export class TestPushCampaignDto {
  @ApiProperty({ example: 8, description: 'Registered app user who should receive the test.' })
  @IsInt()
  @Min(1)
  userId!: number;
}

export class ReviewPushCampaignDto {
  @ApiProperty({ enum: ['APPROVE', 'REJECT'], example: 'APPROVE' })
  @IsIn(['APPROVE', 'REJECT'])
  decision!: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({
    example: 'The message contains an unsupported promotional claim.',
    description: 'Required when rejecting a vendor campaign.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

export class PushCampaignListQueryDto {
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

  @ApiPropertyOptional({ enum: PushCampaignAudienceType })
  @IsOptional()
  @IsEnum(PushCampaignAudienceType)
  audienceType?: PushCampaignAudienceType;

  @ApiPropertyOptional({ enum: PushCampaignApprovalStatus })
  @IsOptional()
  @IsEnum(PushCampaignApprovalStatus)
  approvalStatus?: PushCampaignApprovalStatus;
}
