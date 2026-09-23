import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DeliveryController } from './delivery.controller';
import { DeliveryTrackingController } from './delivery-tracking.controller';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { DeliveryService } from './delivery.service';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { RedisModule } from '../redis/redis.module';
import { SettlementsModule } from '../settlements/settlements.module';

@Module({
  imports: [
    PrismaModule,
    NotificationsModule,
    RedisModule,
    SettlementsModule,
    JwtModule.register({}),
  ],
  controllers: [DeliveryController, DeliveryTrackingController],
  providers: [DeliveryService, DeliveryTrackingService, DeliveryTrackingGateway],
  exports: [DeliveryService, DeliveryTrackingService],
})
export class DeliveryModule {}
