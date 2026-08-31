import { Module } from '@nestjs/common';

import { SettlementsModule } from '../settlements/settlements.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackClient } from './paystack.client';

@Module({
  imports: [SettlementsModule],
  controllers: [PaymentsController],
  providers: [PaymentsService, PaystackClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
