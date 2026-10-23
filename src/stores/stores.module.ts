import { Module } from '@nestjs/common';

import { QoreIDModule } from '../qoreid/qoreid.module';
import { StoreCacService } from './store-cac.service';
import { StoreWalletService } from './store-wallet.service';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { StorePushCampaignsController } from './store-push-campaigns.controller';

@Module({
  imports: [QoreIDModule, NotificationsModule],
  controllers: [StoresController, StorePushCampaignsController],
  providers: [StoresService, StoreCacService, StoreWalletService],
  exports: [StoresService],
})
export class StoresModule {}
