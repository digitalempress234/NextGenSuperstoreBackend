import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { CartModule } from '../cart/cart.module';
import { PaymentsModule } from '../payments/payments.module';
import { StaffModule } from '../staff/staff.module';
import { BnplService } from './bnpl.service';
import { BnplController, BnplAdminController } from './bnpl.controller';

@Module({
  imports: [CheckoutModule, CartModule, PaymentsModule, StaffModule],
  providers: [BnplService],
  controllers: [BnplController, BnplAdminController],
})
export class BnplModule {}
