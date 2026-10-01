import { Module } from '@nestjs/common';
import { SupportAdminController, SupportController } from './support.controller';
import { SupportService } from './support.service';
import { StaffModule } from '../staff/staff.module';
@Module({
  imports: [StaffModule],
  controllers: [SupportController, SupportAdminController],
  providers: [SupportService],
  exports: [SupportService],
})
export class SupportModule {}
