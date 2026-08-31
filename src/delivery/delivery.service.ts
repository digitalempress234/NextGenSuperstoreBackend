import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';

const allowedTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['OFFERED', 'ASSIGNED', 'CANCELLED'],
  OFFERED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'FAILED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'DELIVERED', 'FAILED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
  CANCELLED: [],
};

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly trackingGateway: DeliveryTrackingGateway,
  ) {}

  myDeliveries(riderId: number) {
    return this.prisma.delivery.findMany({
      where: { riderId },
      include: {
        order: {
          include: {
            store: true,
            items: true,
          },
        },
        statusUpdates: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async overview(riderId: number) {
    const [totalDeliveries, completedDeliveries, failedDeliveries, pendingDeliveries] = await Promise.all([
      this.prisma.delivery.count({ where: { riderId } }),
      this.prisma.delivery.count({ where: { riderId, status: 'DELIVERED' } }),
      this.prisma.delivery.count({ where: { riderId, status: { in: ['FAILED', 'CANCELLED'] } } }),
      this.prisma.delivery.count({ where: { riderId, status: { notIn: ['DELIVERED', 'FAILED', 'CANCELLED'] } } }),
    ]);

    return {
      totalDeliveries,
      completedDeliveries,
      failedDeliveries,
      pendingDeliveries,
    };
  }

  offers(riderId: number) {
    return this.prisma.deliveryOffer.findMany({
      where: {
        riderId,
        status: 'PENDING',
      },
      include: {
        delivery: {
          include: {
            order: {
              include: { store: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async accept(riderId: number, offerId: number) {
    const offer = await this.prisma.deliveryOffer.findFirst({
      where: {
        id: offerId,
        riderId,
        status: 'PENDING',
      },
      include: { delivery: true },
    });

    if (!offer) {
      throw new NotFoundException('Delivery offer not found.');
    }

    const delivery = await this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { id: offer.deliveryId },
      });

      if (!delivery || delivery.riderId) {
        throw new BadRequestException('Delivery is no longer available.');
      }

      await tx.deliveryOffer.update({
        where: { id: offerId },
        data: { status: 'ACCEPTED' },
      });

      await tx.delivery.update({
        where: { id: offer.deliveryId },
        data: {
          riderId,
          status: 'ASSIGNED',
          assignedAt: new Date(),
        },
      });

      return tx.delivery.findUnique({
        where: { id: offer.deliveryId },
        include: { order: true },
      });
    });

    if (delivery) {
      await this.notifications.notifyUser({
        userId: delivery.order.userId,
        type: 'DELIVERY_ASSIGNED',
        title: 'Rider assigned',
        message: `A rider has been assigned to order ${delivery.order.orderNumber}.`,
        data: { deliveryId: delivery.id, orderId: delivery.orderId },
        templateKey: 'deliveryAssigned',
        templateData: { orderNumber: delivery.order.orderNumber, riderName: `Rider #${riderId}` },
      });
    }

    return delivery;
  }

  async updateStatus(
    riderId: number,
    deliveryId: number,
    status: DeliveryStatus,
    location?: string,
    note?: string,
  ) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found.');
    }

    if (delivery.riderId !== riderId) {
      throw new ForbiddenException('You are not assigned to this delivery.');
    }

    if (!allowedTransitions[delivery.status].includes(status)) {
      throw new BadRequestException(
        `Invalid delivery transition: ${delivery.status} -> ${status}`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const data: { status: DeliveryStatus; pickedUpAt?: Date; deliveredAt?: Date } = {
        status,
      };

      if (status === 'PICKED_UP') {
        data.pickedUpAt = new Date();
      }

      this.trackingGateway.broadcastStatus({
      deliveryId,
      status,
      occurredAt: new Date().toISOString(),
    });

    if (status === 'DELIVERED') {
        data.deliveredAt = new Date();
      }

      const updated = await tx.delivery.update({
        where: { id: deliveryId },
        data,
      });

      await tx.deliveryStatusUpdate.create({
        data: {
          deliveryId,
          status,
          location,
          note,
        },
      });

      return updated;
    });

    this.trackingGateway.broadcastStatus({
      deliveryId,
      status,
      occurredAt: new Date().toISOString(),
    });

    if (status === 'DELIVERED') {
      const withOrder = await this.prisma.delivery.findUnique({
        where: { id: deliveryId },
        include: { order: true },
      });
      if (withOrder) {
        await this.notifications.notifyUser({
          userId: withOrder.order.userId,
          type: 'DELIVERY_COMPLETED',
          title: 'Order delivered',
          message: `Your order ${withOrder.order.orderNumber} has been delivered.`,
          data: { deliveryId: withOrder.id, orderId: withOrder.orderId },
          templateKey: 'deliveryCompleted',
          templateData: { orderNumber: withOrder.order.orderNumber },
        });
      }
    }

    return updated;
  }
}
