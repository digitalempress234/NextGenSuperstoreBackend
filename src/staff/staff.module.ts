import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { StaffAuthController, StaffController } from './staff.controller';
import { StaffJwtGuard } from './staff-jwt.guard';
import { StaffService } from './staff.service';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    // Register JwtModule without a global secret so StaffService can use JWT_STAFF_SECRET
    JwtModule.register({}),
  ],
  controllers: [StaffAuthController, StaffController],
  providers: [StaffService, StaffJwtGuard],
  exports: [StaffService, StaffJwtGuard],
})
export class StaffModule {}
