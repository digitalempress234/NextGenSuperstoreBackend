import { Module } from '@nestjs/common';

import { QoreIDModule } from '../qoreid/qoreid.module';
import { StoreCacService } from './store-cac.service';
import { StoreWalletService } from './store-wallet.service';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

@Module({
  imports: [QoreIDModule],
  controllers: [StoresController],
  providers: [StoresService, StoreCacService, StoreWalletService],
  exports: [StoresService],
})
export class StoresModule {}
