import { Module } from '@nestjs/common';

import { QoreIDService } from './qoreid.service';

@Module({
  providers: [QoreIDService],
  exports: [QoreIDService],
})
export class QoreIDModule {}
