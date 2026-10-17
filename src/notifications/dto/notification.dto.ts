import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DevicePlatform, NotificationType } from '@prisma/client';

export class NotificationListQueryDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
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

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  unreadOnly?: boolean;
}

export class UpdateNotificationPreferenceDto {
  @ApiProperty({ enum: NotificationType, example: NotificationType.ORDER_STATUS_UPDATE })
  @IsEnum(NotificationType)
  type!: NotificationType;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  push?: boolean;
}

export class RegisterNotificationDeviceDto {
  @ApiProperty({ description: 'FCM registration token for this app installation.' })
  @IsString()
  token!: string;

  @ApiProperty({ enum: DevicePlatform, example: DevicePlatform.ANDROID })
  @IsEnum(DevicePlatform)
  platform!: DevicePlatform;

  @ApiPropertyOptional({ example: 'pixel-8-installation-id' })
  @IsOptional()
  @IsString()
  deviceId?: string;
}

export class AnnouncementDto {
  @ApiProperty({ example: 'Planned maintenance' })
  @IsString()
  title!: string;

  @ApiProperty({ example: 'The platform will be unavailable from 01:00 to 02:00 WAT.' })
  @IsString()
  message!: string;
}
