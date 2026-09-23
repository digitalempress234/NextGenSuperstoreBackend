import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { CartModule } from '../cart/cart.module';

import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [CheckoutModule, CartModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
