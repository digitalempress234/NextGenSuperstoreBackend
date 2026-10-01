import { Module } from '@nestjs/common';

import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { AddressesController } from './addresses.controller';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [UsersController, AddressesController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
