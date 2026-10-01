import { Module } from '@nestjs/common';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StaffModule } from '../staff/staff.module';
import { AdminListingsController } from './admin-listings.controller';

@Module({
  imports: [NotificationsModule, StaffModule],
  controllers: [AdminController, AdminListingsController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
