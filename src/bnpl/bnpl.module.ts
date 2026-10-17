import { Module } from '@nestjs/common';
import { CheckoutModule } from '../checkout/checkout.module';
import { CartModule } from '../cart/cart.module';
import { PaymentsModule } from '../payments/payments.module';
import { StaffModule } from '../staff/staff.module';
import { BnplService } from './bnpl.service';
import { BnplController, BnplAdminController } from './bnpl.controller';
import { KlumpAdminController, KlumpController, KlumpWebhookController } from './klump.controller';
import { KlumpClient } from './klump.client';
import { KlumpService } from './klump.service';

@Module({
  imports: [CheckoutModule, CartModule, PaymentsModule, StaffModule],
  providers: [BnplService, KlumpClient, KlumpService],
  controllers: [
    BnplController,
    BnplAdminController,
    KlumpController,
    KlumpWebhookController,
    KlumpAdminController,
  ],
})
export class BnplModule {}
