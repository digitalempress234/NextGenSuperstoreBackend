import { Module } from '@nestjs/common';
import { OrderQrController, RiderScanController, StoreScanController } from './scanning.controller';
import { ScanningService } from './scanning.service';
import { SettlementsModule } from '../settlements/settlements.module';
import { DeliveryModule } from '../delivery/delivery.module';
@Module({
  imports: [SettlementsModule, DeliveryModule],
  controllers: [OrderQrController, RiderScanController, StoreScanController],
  providers: [ScanningService],
  exports: [ScanningService],
})
export class ScanningModule {}
