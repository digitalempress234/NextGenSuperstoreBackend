import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffModule } from '../staff/staff.module';
import { AdminListingsController } from './admin-listings.controller';
import { PaymentsModule } from '../payments/payments.module';
import { DeliveryModule } from '../delivery/delivery.module';
import { PushCampaignsController } from './push-campaigns.controller';

@Module({
  imports: [NotificationsModule, StaffModule, PaymentsModule, DeliveryModule],
  controllers: [AdminController, AdminListingsController, PushCampaignsController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
