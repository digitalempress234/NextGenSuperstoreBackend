import { Module } from '@nestjs/common';

import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';
import { BankResolverService } from './bank-resolver.service';
import { RiderWalletService } from './rider-wallet.service';
import { IdentroModule } from '../identro/identro.module';
import { QoreIDModule } from '../qoreid/qoreid.module';

@Module({
  imports: [IdentroModule, QoreIDModule],
  controllers: [RidersController],
  providers: [RidersService, BankResolverService, RiderWalletService],
  exports: [RidersService],
})
export class RidersModule {}
