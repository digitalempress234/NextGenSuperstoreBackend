import { Module } from '@nestjs/common';

import { QoreIDModule } from '../qoreid/qoreid.module';
import { StoreCacService } from './store-cac.service';
import { StoreWalletService } from './store-wallet.service';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorePushCampaignsController } from './store-push-campaigns.controller';
import { StoreAvailabilityService } from './store-availability.service';

@Module({
  imports: [QoreIDModule, NotificationsModule],
  controllers: [StoresController, StorePushCampaignsController],
  providers: [StoresService, StoreCacService, StoreWalletService, StoreAvailabilityService],
  exports: [StoresService, StoreAvailabilityService],
})
export class StoresModule {}
