import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { OkExample } from '../common/api-docs';

import { CurrentUser } from '../common/current-user.decorator';
import {
  NotificationListQueryDto,
  RegisterNotificationDeviceDto,
  UpdateNotificationPreferenceDto,
} from './dto/notification.dto';
import { NotificationsService } from './notifications.service';

@ApiTags('Notifications')
@ApiCookieAuth('purse_access_token')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  @ApiOperation({ summary: 'List current user in-app notifications' })
  @ApiOkResponse({ description: 'Paginated notifications with unread count.' })
  list(@CurrentUser('id') userId: number, @Query() query: NotificationListQueryDto) {
    return this.notificationsService.list(userId, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get current user unread notification count' })
  @OkExample({ unreadCount: 5 }, 'Unread count')
  unreadCount(@CurrentUser('id') userId: number) {
    return this.notificationsService.unreadCount(userId);
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark one notification as read' })
  @OkExample({ success: true }, 'Notification marked as read')
  read(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) notificationId: number) {
    return this.notificationsService.read(userId, notificationId);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'Mark all current user notifications as read' })
  @OkExample({ success: true }, 'All notifications marked as read')
  readAll(@CurrentUser('id') userId: number) {
    return this.notificationsService.readAll(userId);
  }

  @Get('preferences')
  @ApiOperation({
    summary: 'Get notification delivery preferences',
    description:
      'Preferences may be configured independently for orders, payments, wallet funding, delivery, rider jobs, chat messages, support replies, rewards, KYC updates, and MARKETING campaigns.',
  })
  @OkExample(
    [{ type: 'ORDER_STATUS_UPDATE', inApp: true, email: true, push: true }],
    'Notification preferences',
  )
  preferences(@CurrentUser('id') userId: number) {
    return this.notificationsService.preferences(userId);
  }

  @Patch('preferences')
  @ApiOperation({
    summary: 'Update an in-app, email, or push notification preference',
    description:
      'Use type MARKETING to opt in or out of advertising notifications without affecting transactional alerts.',
  })
  @OkExample(
    { type: 'ORDER_STATUS_UPDATE', inApp: true, email: true, push: true },
    'Notification preference updated',
  )
  updatePreference(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.notificationsService.updatePreference(userId, dto);
  }

  @Post('devices')
  @ApiOperation({
    summary: 'Register or refresh an FCM device token',
    description:
      'Used for background notifications including orders, payments, wallet funding, delivery jobs, chat, support, rewards, KYC, and opted-in marketing campaigns. Foreground clients may also connect to Socket.IO namespace /notifications and listen for notification.created.',
  })
  registerDevice(@CurrentUser('id') userId: number, @Body() dto: RegisterNotificationDeviceDto) {
    return this.notificationsService.registerDevice(userId, dto);
  }

  @Delete('devices/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Unregister an FCM device token' })
  unregisterDevice(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) deviceId: number) {
    return this.notificationsService.unregisterDevice(userId, deviceId);
  }
}
