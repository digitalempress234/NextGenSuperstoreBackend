import { Global, Module } from '@nestjs/common';

import { LoggingModule } from '../logging/logging.module';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  imports: [LoggingModule],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
