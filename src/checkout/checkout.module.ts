import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { PaymentsModule } from '../payments/payments.module';
import { StaffModule } from '../staff/staff.module';
import { CheckoutSettingsService } from './checkout-settings.service';
import {
  CheckoutSettingsController,
  PickupStationsController,
} from './checkout-settings.controller';

import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

import { NotificationsModule } from '../notifications/notifications.module';
import { StoresModule } from '../stores/stores.module';

@Module({
  imports: [NotificationsModule, CartModule, PaymentsModule, StaffModule, StoresModule],
  controllers: [CheckoutController, CheckoutSettingsController, PickupStationsController],
  providers: [CheckoutService, CheckoutSettingsService],
  exports: [CheckoutService, CheckoutSettingsService],
})
export class CheckoutModule {}
