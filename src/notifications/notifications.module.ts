import { Global, Module } from '@nestjs/common';

import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

import { MailModule } from '../mail/mail.module';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsGateway } from './notifications.gateway';
import { PushNotificationsService } from './push-notifications.service';
import { PushCampaignsService } from './push-campaigns.service';

@Global()
@Module({
  imports: [MailModule, JwtModule.register({})],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsGateway,
    PushNotificationsService,
    PushCampaignsService,
  ],
  exports: [NotificationsService, PushCampaignsService],
})
export class NotificationsModule {}
