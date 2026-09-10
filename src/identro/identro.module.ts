import { Module } from '@nestjs/common';

import { IdentroService } from './identro.service';

@Module({
  providers: [IdentroService],
  exports: [IdentroService],
})
export class IdentroModule {}
