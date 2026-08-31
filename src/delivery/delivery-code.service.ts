import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomInt } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { VerifyDeliveryCodeDto } from './dto/verify-delivery-code.dto';

@Injectable()
export class DeliveryCodeService {
  private readonly maxAttempts = 5;
  private readonly ttlMinutes = 180;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async issue(deliveryId: number, actorUserId: number) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: {
          select: {
            id: true,
            orderNumber: true,
            userId: true,
          },
        },
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    if (delivery.riderId !== actorUserId) {
      throw new ForbiddenException('Only the assigned rider can issue the delivery code');
    }

    if (delivery.status === 'DELIVERED') {
      throw new BadRequestException('Delivery is already completed');
    }

    const code = randomInt(100000, 1000000).toString();
    const codeHash = this.hash(code);
    const expiresAt = new Date(Date.now() + this.ttlMinutes * 60_000);

    await this.prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        deliveryCodeHash: codeHash,
        deliveryCodeExpiresAt: expiresAt,
        deliveryCodeAttempts: 0,
      },
    });

    await this.notifications.notifyUser({
      userId: delivery.order.userId,
      type: 'DELIVERY_CODE',
      title: 'Your delivery code',
      message:
        `Your delivery code for order ${delivery.order.orderNumber} ` +
        `has been sent to your app and email.`,
      data: {
        orderNumber: delivery.order.orderNumber,
        deliveryId,
      },
      templateKey: 'deliveryCode',
      templateData: {
        orderNumber: delivery.order.orderNumber,
        code,
        expiresInMinutes: this.ttlMinutes,
      },
    });

    return {
      deliveryId,
      expiresAt,
      deliveryStatus: delivery.status,
    };
  }

  async verify(deliveryId: number, dto: VerifyDeliveryCodeDto, actorUserId: number) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: {
        order: true,
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }

    if (delivery.riderId !== actorUserId) {
      throw new ForbiddenException('Only the assigned rider can verify delivery');
    }

    if (delivery.status === 'DELIVERED') {
      throw new BadRequestException('Delivery is already completed');
    }

    if (!delivery.deliveryCodeHash || !delivery.deliveryCodeExpiresAt) {
      throw new BadRequestException('No active delivery code exists');
    }

    if (delivery.deliveryCodeExpiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Delivery code has expired');
    }

    if (delivery.deliveryCodeAttempts >= this.maxAttempts) {
      throw new ForbiddenException('Delivery code verification is locked');
    }

    const valid = this.hash(dto.code) === delivery.deliveryCodeHash;

    if (!valid) {
      await this.prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          deliveryCodeAttempts: {
            increment: 1,
          },
        },
      });

      throw new BadRequestException('Invalid delivery code');
    }

    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          status: 'DELIVERED',
          deliveredAt: now,
          deliveryCodeHash: null,
          deliveryCodeExpiresAt: null,
          deliveryCodeAttempts: 0,
        },
      }),
      this.prisma.deliveryStatusUpdate.create({
        data: {
          deliveryId,
          status: 'DELIVERED',
          occurredAt: now,
        },
      }),
      this.prisma.order.update({
        where: { id: delivery.orderId },
        data: {
          currentStatus: 'DELIVERED',
        },
      }),
    ]);

    await this.notifications.notifyUser({
      userId: delivery.order.userId,
      type: 'DELIVERY_COMPLETED',
      title: 'Delivery completed',
      message: `Order ${delivery.order.orderNumber} has been delivered successfully.`,
      data: {
        orderNumber: delivery.order.orderNumber,
        deliveryId,
      },
      templateKey: 'deliveryCompleted',
      templateData: {
        orderNumber: delivery.order.orderNumber,
      },
    });

    return {
      deliveryId,
      status: 'DELIVERED',
      verifiedAt: now,
    };
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
