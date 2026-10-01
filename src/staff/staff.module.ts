import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffAuthController, StaffController } from './staff.controller';
import { StaffJwtGuard } from './staff-jwt.guard';
import { StaffService } from './staff.service';
import { StaffPermissionGuard } from './staff-permission.guard';

@Module({
  imports: [PrismaModule, MailModule, JwtModule.register({})],
  controllers: [StaffAuthController, StaffController],
  providers: [StaffService, StaffJwtGuard, StaffPermissionGuard],
  exports: [StaffService, StaffJwtGuard, StaffPermissionGuard, JwtModule],
})
export class StaffModule {}
