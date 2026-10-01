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
import { SettlementsService } from '../settlements/settlements.service';
import { canTransitionOrder } from '../orders/order-status';

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
    private readonly settlements: SettlementsService,
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
    const [totalDeliveries, completedDeliveries, failedDeliveries, pendingDeliveries] =
      await Promise.all([
        this.prisma.delivery.count({ where: { riderId } }),
        this.prisma.delivery.count({ where: { riderId, status: 'DELIVERED' } }),
        this.prisma.delivery.count({ where: { riderId, status: { in: ['FAILED', 'CANCELLED'] } } }),
        this.prisma.delivery.count({
          where: { riderId, status: { notIn: ['DELIVERED', 'FAILED', 'CANCELLED'] } },
        }),
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
      include: { delivery: { include: { order: true } } },
    });

    if (!offer) {
      throw new NotFoundException('Delivery offer not found.');
    }

    const delivery = await this.prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findUnique({
        where: { id: offer.deliveryId },
        include: { order: true },
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

      const order = delivery.order;
      if (
        order.currentStatus !== 'RIDER_ASSIGNED' &&
        !canTransitionOrder(order.currentStatus, 'RIDER_ASSIGNED')
      ) {
        throw new BadRequestException(
          `Order ${order.id} is not ready for rider assignment from ${order.currentStatus}.`,
        );
      }
      if (
        order.currentStatus !== 'RIDER_ASSIGNED' &&
        canTransitionOrder(order.currentStatus, 'RIDER_ASSIGNED')
      ) {
        await tx.order.update({
          where: { id: order.id },
          data: { currentStatus: 'RIDER_ASSIGNED' },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            fromStatus: order.currentStatus,
            toStatus: 'RIDER_ASSIGNED',
            changedById: riderId,
            reason: 'Rider accepted the delivery assignment.',
          },
        });
      }

      await this.settlements.holdRiderEarning(offer.deliveryId, tx);

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
      include: { order: true },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found.');
    }

    if (delivery.riderId !== riderId) {
      throw new ForbiddenException('You are not assigned to this delivery.');
    }

    if (!allowedTransitions[delivery.status].includes(status)) {
      throw new BadRequestException(`Invalid delivery transition: ${delivery.status} -> ${status}`);
    }

    if (status === 'PICKED_UP' || status === 'DELIVERED') {
      throw new BadRequestException(
        status === 'PICKED_UP'
          ? 'Confirm pickup with the store handoff QR instead of setting PICKED_UP directly.'
          : 'Confirm delivery with the customer QR instead of setting DELIVERED directly.',
      );
    }

    const synchronizedOrderStatus =
      status === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY' ? 'OUT_FOR_DELIVERY' : null;
    if (
      synchronizedOrderStatus &&
      delivery.order.currentStatus !== synchronizedOrderStatus &&
      !canTransitionOrder(delivery.order.currentStatus, synchronizedOrderStatus)
    ) {
      throw new BadRequestException(
        `Order ${delivery.orderId} cannot move from ${delivery.order.currentStatus} to ${synchronizedOrderStatus}.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.update({
        where: { id: deliveryId },
        data: { status },
      });

      await tx.deliveryStatusUpdate.create({
        data: {
          deliveryId,
          status,
          location,
          note,
        },
      });

      if (synchronizedOrderStatus && delivery.order.currentStatus !== synchronizedOrderStatus) {
        await tx.order.update({
          where: { id: delivery.orderId },
          data: { currentStatus: synchronizedOrderStatus },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: delivery.orderId,
            fromStatus: delivery.order.currentStatus,
            toStatus: synchronizedOrderStatus,
            changedById: riderId,
            reason: `Synchronized from rider delivery status ${status}.`,
          },
        });
      }

      return updated;
    });

    this.trackingGateway.broadcastStatus({
      deliveryId,
      status,
      occurredAt: new Date().toISOString(),
    });

    return updated;
  }
}
