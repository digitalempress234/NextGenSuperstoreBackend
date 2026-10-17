import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { CartModule } from '../cart/cart.module';
import { RewardsModule } from '../rewards/rewards.module';
import { PaymentsModule } from '../payments/payments.module';
import { DeliveryModule } from '../delivery/delivery.module';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CheckoutModule, CartModule, RewardsModule, PaymentsModule, DeliveryModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
