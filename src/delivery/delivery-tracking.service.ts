import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UpdateDeliveryLocationDto } from './dto/tracking.dto';

const ACTIVE_STATUSES: DeliveryStatus[] = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
  DeliveryStatus.OUT_FOR_DELIVERY,
];

@Injectable()
export class DeliveryTrackingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly config: ConfigService,
  ) {}

  async assertCanTrack(userId: number, deliveryId: number): Promise<void> {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: {
        id: true,
        riderId: true,
        status: true,
        order: { select: { userId: true } },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found.');
    }

    if (delivery.riderId === userId || delivery.order.userId === userId) {
      return;
    }

    throw new ForbiddenException('You cannot access this delivery tracking session.');
  }

  async recordLocation(riderId: number, deliveryId: number, input: UpdateDeliveryLocationDto) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      select: { id: true, riderId: true, status: true },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found.');
    }

    if (delivery.riderId !== riderId) {
      throw new ForbiddenException('You are not assigned to this delivery.');
    }

    if (!ACTIVE_STATUSES.includes(delivery.status)) {
      throw new BadRequestException('Location updates are only accepted for an active delivery.');
    }

    const rateLimitMs = Number(
      this.config.get<string>('DELIVERY_LOCATION_MIN_INTERVAL_MS', '1000'),
    );
    const rateKey = `delivery-location:${riderId}:${deliveryId}`;
    const acquired = await this.redis.client.set(rateKey, '1', 'PX', rateLimitMs, 'NX');
    if (!acquired) {
      throw new HttpException('Location update rate exceeded.', HttpStatus.TOO_MANY_REQUESTS);
    }

    return this.prisma.deliveryLocation.create({
      data: {
        deliveryId,
        riderId,
        latitude: input.latitude,
        longitude: input.longitude,
        accuracyM: input.accuracyM,
        speedKph: input.speedKph,
        headingDeg: input.headingDeg,
        batteryLevel: input.batteryLevel,
      },
    });
  }

  async current(userId: number, deliveryId: number) {
    await this.assertCanTrack(userId, deliveryId);
    return this.prisma.deliveryLocation.findFirst({
      where: { deliveryId },
      orderBy: { recordedAt: 'desc' },
    });
  }

  async history(userId: number, deliveryId: number, limit = 100) {
    await this.assertCanTrack(userId, deliveryId);
    return this.prisma.deliveryLocation.findMany({
      where: { deliveryId },
      orderBy: { recordedAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });
  }
}
