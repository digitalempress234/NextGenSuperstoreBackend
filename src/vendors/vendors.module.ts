import { Module } from '@nestjs/common';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';
import { IdentroModule } from '../identro/identro.module';
import { QoreIDModule } from '../qoreid/qoreid.module';

@Module({
  imports: [IdentroModule, QoreIDModule],
  controllers: [VendorsController],
  providers: [VendorsService],
})
export class VendorsModule {}
