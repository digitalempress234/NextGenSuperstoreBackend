import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const transitions: Record<OrderStatus, OrderStatus[]> = {
  ORDER_RECEIVED: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PREPARING', 'CANCELLED'],
  PREPARING: ['READY_FOR_PICKUP', 'RIDER_ASSIGNED', 'CANCELLED'],
  READY_FOR_PICKUP: ['PICKED_UP', 'RIDER_ASSIGNED', 'CANCELLED'],
  RIDER_ASSIGNED: ['OUT_FOR_DELIVERY', 'CANCELLED'],
  OUT_FOR_DELIVERY: ['PICKED_UP', 'DELIVERED', 'CANCELLED'],
  PICKED_UP: ['DELIVERED', 'COMPLETED'],
  DELIVERED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  mine(userId: number) {
    return this.prisma.order.findMany({
      where: { userId },
      include: {
        items: true,
        store: true,
        delivery: { include: { statusUpdates: true } },
        pickup: true,
        statusHistory: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async one(userId: number, id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        store: true,
        delivery: { include: { statusUpdates: true } },
        pickup: true,
        statusHistory: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order.');
    }

    return order;
  }

  async track(userId: number, id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            id: true,
            storeName: true,
            phone: true,
            address: true,
            city: true,
            state: true,
          },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
          select: {
            fromStatus: true,
            toStatus: true,
            reason: true,
            createdAt: true,
          },
        },
        delivery: {
          select: {
            id: true,
            status: true,
            deliveryAddress: true,
            deliveryCity: true,
            deliveryState: true,
            assignedAt: true,
            pickedUpAt: true,
            deliveredAt: true,
            trackingMapUrl: true,
            statusUpdates: {
              orderBy: { occurredAt: 'asc' },
              select: {
                status: true,
                location: true,
                note: true,
                occurredAt: true,
              },
            },
          },
        },
        pickup: {
          select: {
            status: true,
            qrToken: true,
            expiresAt: true,
            preparedAt: true,
            collectedAt: true,
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (order.userId !== userId) {
      throw new ForbiddenException('You do not have access to this order.');
    }

    
    let latestLocation: {
      latitude: number;
      longitude: number;
      accuracyM: number | null;
      speedKph: number | null;
      headingDeg: number | null;
      recordedAt: Date;
    } | null = null;

    if (order.delivery) {
      const loc = await this.prisma.deliveryLocation.findFirst({
        where: { deliveryId: order.delivery.id },
        orderBy: { recordedAt: 'desc' },
        select: {
          latitude: true,
          longitude: true,
          accuracyM: true,
          speedKph: true,
          headingDeg: true,
          recordedAt: true,
        },
      });

      if (loc) {
        latestLocation = {
          latitude: Number(loc.latitude),
          longitude: Number(loc.longitude),
          accuracyM: loc.accuracyM == null ? null : Number(loc.accuracyM),
          speedKph: loc.speedKph == null ? null : Number(loc.speedKph),
          headingDeg: loc.headingDeg == null ? null : Number(loc.headingDeg),
          recordedAt: loc.recordedAt,
        };
      }
    }

    return {
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        fulfillmentType: order.fulfillmentType,
        currentStatus: order.currentStatus,
        placedAt: order.placedAt,
        updatedAt: order.updatedAt,
        store: order.store,
        statusHistory: order.statusHistory,
      },
      delivery: order.delivery
        ? {
            ...order.delivery,
            latestLocation,
          }
        : null,
      pickup: order.pickup ?? null,
      
      websocket:
        order.delivery
          ? {
              namespace: '/delivery',
              joinEvent: 'delivery:join',
              payload: { deliveryId: order.delivery.id },
              locationEvent: 'delivery.location.updated',
              statusEvent: 'delivery.status.updated',
            }
          : null,
    };
  }

  async setStatus(actorId: number, id: number, status: OrderStatus, reason?: string) {
    const order = await this.prisma.order.findUnique({ where: { id } });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    if (!transitions[order.currentStatus].includes(status)) {
      throw new BadRequestException(
        `Invalid order transition: ${order.currentStatus} -> ${status}`,
      );
    }

    const updatedOrder = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: { currentStatus: status },
      });

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.currentStatus,
          toStatus: status,
          changedById: actorId,
          reason,
        },
      });

      return updated;
    });

    await this.notifications.notifyUser({
      userId: updatedOrder.userId,
      type: updatedOrder.currentStatus === 'CANCELLED' ? 'ORDER_CANCELLED' : 'ORDER_STATUS_UPDATE',
      title:
        updatedOrder.currentStatus === 'CANCELLED' ? 'Order cancelled' : 'Order status updated',
      message: `Order ${updatedOrder.orderNumber} is now ${updatedOrder.currentStatus}.`,
      data: {
        orderId: updatedOrder.id,
        orderNumber: updatedOrder.orderNumber,
        status: updatedOrder.currentStatus,
      },
      templateKey: 'orderStatus',
      templateData: {
        orderNumber: updatedOrder.orderNumber,
        statusLabel: updatedOrder.currentStatus,
        message: reason ?? '',
      },
    });

    return updatedOrder;
  }
}
