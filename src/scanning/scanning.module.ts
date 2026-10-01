import { Module } from '@nestjs/common';
import { OrderQrController, RiderScanController, StoreScanController } from './scanning.controller';
import { ScanningService } from './scanning.service';
import { SettlementsModule } from '../settlements/settlements.module';
@Module({
  imports: [SettlementsModule],
  controllers: [OrderQrController, RiderScanController, StoreScanController],
  providers: [ScanningService],
  exports: [ScanningService],
})
export class ScanningModule {}
