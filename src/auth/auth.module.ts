import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { MailModule } from '../mail/mail.module';
import { PrismaModule } from '../prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { RbacModule } from '../rbac/rbac.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtGuard } from './jwt.guard';
import { PasskeyController } from './passkey.controller';
import { PasskeyService } from './passkey.service';

@Module({
  imports: [JwtModule.register({}), PrismaModule, RedisModule, RbacModule, MailModule],
  controllers: [AuthController, PasskeyController],
  providers: [AuthService, GoogleAuthService, JwtGuard, PasskeyService],
  exports: [AuthService, JwtGuard, JwtModule],
})
export class AuthModule {}
