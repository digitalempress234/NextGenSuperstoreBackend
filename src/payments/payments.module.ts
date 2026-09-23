import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';

import { SettlementsModule } from '../settlements/settlements.module';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PaystackClient } from './paystack.client';
import { WalletController } from './wallet.controller';
import { PaymentWebhookController } from './payment-webhook.controller';

@Module({
  imports: [SettlementsModule, CartModule],
  controllers: [PaymentsController, WalletController, PaymentWebhookController],
  providers: [PaymentsService, PaystackClient],
  exports: [PaymentsService],
})
export class PaymentsModule {}
