import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { OkExample } from '../common/api-docs';

import { CurrentUser } from '../common/current-user.decorator';
import { NotificationListQueryDto, UpdateNotificationPreferenceDto } from './dto/notification.dto';
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
  @ApiOperation({ summary: 'Get notification delivery preferences' })
  @OkExample(
    [{ type: 'ORDER_STATUS_UPDATE', inApp: true, email: true }],
    'Notification preferences',
  )
  preferences(@CurrentUser('id') userId: number) {
    return this.notificationsService.preferences(userId);
  }

  @Patch('preferences')
  @ApiOperation({ summary: 'Update an in-app/email notification preference' })
  @OkExample(
    { type: 'ORDER_STATUS_UPDATE', inApp: true, email: true },
    'Notification preference updated',
  )
  updatePreference(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateNotificationPreferenceDto,
  ) {
    return this.notificationsService.updatePreference(userId, dto);
  }
}
