import { Module } from '@nestjs/common';

import { StaffModule } from '../staff/staff.module';
import { AdminPromotionsController, StorePromotionsController } from './promotions.controller';
import { PromotionsService } from './promotions.service';

@Module({
  imports: [StaffModule],
  controllers: [StorePromotionsController, AdminPromotionsController],
  providers: [PromotionsService],
  exports: [PromotionsService],
})
export class PromotionsModule {}
