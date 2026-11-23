import { Module } from '@nestjs/common';

import { MailModule } from '../mail/mail.module';
import { StaffModule } from '../staff/staff.module';
import {
  AdminReceiptsController,
  OrderReceiptsController,
  ReceiptsController,
  StoreReceiptsController,
} from './receipts.controller';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceiptSettingsService } from './receipt-settings.service';
import { ReceiptsService } from './receipts.service';

@Module({
  imports: [MailModule, StaffModule],
  controllers: [
    ReceiptsController,
    OrderReceiptsController,
    StoreReceiptsController,
    AdminReceiptsController,
  ],
  providers: [ReceiptsService, ReceiptPdfService, ReceiptSettingsService],
  exports: [ReceiptsService, ReceiptSettingsService],
})
export class ReceiptsModule {}
