import { Module } from '@nestjs/common';
import { RewardsAdminController, RewardsController } from './rewards.controller';
import { StaffModule } from '../staff/staff.module';
import { RewardsService } from './rewards.service';

@Module({
  imports: [StaffModule],
  controllers: [RewardsController, RewardsAdminController],
  providers: [RewardsService],
  exports: [RewardsService],
})
export class RewardsModule {}
