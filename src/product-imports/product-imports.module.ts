import { Module } from '@nestjs/common';

import { StaffModule } from '../staff/staff.module';
import { AdminProductImportsController } from './admin-product-imports.controller';
import { ProductImportsService } from './product-imports.service';
import { StoreProductImportsController } from './store-product-imports.controller';

@Module({
  imports: [StaffModule],
  controllers: [StoreProductImportsController, AdminProductImportsController],
  providers: [ProductImportsService],
  exports: [ProductImportsService],
})
export class ProductImportsModule {}
