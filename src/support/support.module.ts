import { Module } from '@nestjs/common';
import { SupportAdminController, SupportController } from './support.controller';
import { SupportService } from './support.service';
import { StaffModule } from '../staff/staff.module';
import { RiderSupportController } from './rider-support.controller';
@Module({
  imports: [StaffModule],
  controllers: [SupportController, RiderSupportController, SupportAdminController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
