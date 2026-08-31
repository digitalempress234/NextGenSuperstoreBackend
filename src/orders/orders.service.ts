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

  async setStatus(
    actorId: number,
    id: number,
    status: OrderStatus,
    reason?: string,
  ) {
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
      title: updatedOrder.currentStatus === 'CANCELLED' ? 'Order cancelled' : 'Order status updated',
      message: `Order ${updatedOrder.orderNumber} is now ${updatedOrder.currentStatus}.`,
      data: { orderId: updatedOrder.id, orderNumber: updatedOrder.orderNumber, status: updatedOrder.currentStatus },
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
