import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { ReturnOrderDto } from './dto/order.dto';
import { CartService } from '../cart/cart.service';
import { ConflictException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../common/types';
import { canTransitionOrder, STORE_MANAGED_ORDER_STATUSES } from './order-status';

function screenStatus(status: OrderStatus) {
  if (status === 'ORDER_RECEIVED' || status === 'CONFIRMED') return 'pending';
  if (status === 'READY_FOR_PICKUP') return 'ready_for_pickup';
  if (status === 'CANCELLED') return 'cancelled';
  if (['PICKED_UP', 'DELIVERED', 'COMPLETED'].includes(status)) return 'delivered';
  return 'in_progress';
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly cart: CartService,
  ) {}

  mine(
    userId: number,
    page = 1,
    limit = 15,
    status?: 'all' | 'pending' | 'in_progress' | 'ready_for_pickup' | 'delivered' | 'cancelled',
  ) {
    const statuses: Record<Exclude<NonNullable<typeof status>, 'all'>, OrderStatus[]> = {
      pending: ['ORDER_RECEIVED', 'CONFIRMED'],
      in_progress: ['PREPARING', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'],
      ready_for_pickup: ['READY_FOR_PICKUP'],
      delivered: ['PICKED_UP', 'DELIVERED', 'COMPLETED'],
      cancelled: ['CANCELLED'],
    };
    return this.prisma.order
      .findMany({
        where: {
          userId,
          ...(status && status !== 'all' ? { currentStatus: { in: statuses[status] } } : {}),
        },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          items: true,
          allocations: {
            include: { paymentGroup: { select: { id: true, status: true, paymentMethod: true } } },
          },
          store: true,
          delivery: { include: { statusUpdates: true } },
          pickup: true,
          statusHistory: true,
        },
        orderBy: { createdAt: 'desc' },
      })
      .then((orders) =>
        orders.map((order) => ({
          ...order,
          orderId: order.id,
          status: screenStatus(order.currentStatus),
          paymentStatus: order.allocations[0]?.paymentGroup.status.toLowerCase() ?? 'pending',
          paymentMethod: order.allocations[0]?.paymentGroup.paymentMethod.toLowerCase() ?? null,
          itemDescription:
            order.items[0]?.productName && order.items.length > 1
              ? `${order.items[0].productName} & ${order.items.length - 1} more item${order.items.length > 2 ? 's' : ''}`
              : (order.items[0]?.productName ?? ''),
          firstItemImage: order.items[0]?.productImage ?? null,
        })),
      );
  }

  async one(userId: number, id: number) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        allocations: {
          include: { paymentGroup: { select: { id: true, status: true, paymentMethod: true } } },
        },
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

    return {
      ...order,
      orderId: order.id,
      status: screenStatus(order.currentStatus),
      paymentStatus: order.allocations[0]?.paymentGroup.status.toLowerCase() ?? 'pending',
      paymentMethod: order.allocations[0]?.paymentGroup.paymentMethod.toLowerCase() ?? null,
      deliveryMethod: order.fulfillmentType === 'DELIVERY' ? 'home_delivery' : 'store_pickup',
      deliveryDetails:
        order.fulfillmentType === 'DELIVERY'
          ? {
              name: order.customerName,
              address: order.deliveryAddress,
              city: order.deliveryCity,
              state: order.deliveryState,
              phone: order.customerPhone,
              email: order.customerEmail,
            }
          : order.pickup,
      timeline: order.statusHistory.map((event) => ({
        step: event.toStatus.toLowerCase(),
        label: event.toStatus.replaceAll('_', ' ').toLowerCase(),
        completedAt: event.createdAt,
        isCompleted: true,
      })),
    };
  }

  async reorder(userId: number, id: number) {
    const order = await this.one(userId, id);
    if (!['COMPLETED', 'DELIVERED', 'PICKED_UP'].includes(order.currentStatus)) {
      throw new BadRequestException('Only fulfilled orders can be reordered.');
    }
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.cart.lock(tx, userId);
      const addedItems: Array<{ productId: number; storeProductId: number }> = [];
      const skippedItems: Array<{ productId: number; storeProductId: number; reason: string }> = [];
      for (const item of order.items) {
        try {
          await this.cart.addInTransaction(tx, cart.id, item.storeProductId, item.quantity);
          addedItems.push({ productId: item.productId, storeProductId: item.storeProductId });
        } catch (error) {
          if (!(error instanceof NotFoundException || error instanceof ConflictException))
            throw error;
          skippedItems.push({
            productId: item.productId,
            storeProductId: item.storeProductId,
            reason: error.message,
          });
        }
      }
      return {
        status: skippedItems.length ? 'partial' : 'success',
        cart: await this.cart.recalculate(tx, cart.id),
        addedItems,
        skippedItems,
      };
    });
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
      orderId: order.id,
      currentStatus: screenStatus(order.currentStatus),
      currentLocation: latestLocation,
      estimatedDelivery: null,
      timeline: order.statusHistory.map((event) => ({
        step: event.toStatus.toLowerCase(),
        label: event.toStatus.replaceAll('_', ' ').toLowerCase(),
        completedAt: event.createdAt,
      })),
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

      websocket: order.delivery
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

  async setStatus(actor: AuthenticatedUser, id: number, status: OrderStatus, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        store: {
          select: {
            ownerUserId: true,
            members: { where: { userId: actor.id }, select: { userId: true } },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found.');
    }

    const isStoreOperator =
      order.store.ownerUserId === actor.id ||
      order.store.members.some((member) => member.userId === actor.id);
    if (!isStoreOperator) {
      throw new ForbiddenException(
        "Only this order's store owner or store staff can update preparation status.",
      );
    }

    if (order.currentStatus === 'ORDER_RECEIVED') {
      throw new BadRequestException(
        'Unpaid orders must be confirmed by payment verification or cancelled through checkout.',
      );
    }

    if (!STORE_MANAGED_ORDER_STATUSES.includes(status)) {
      throw new ForbiddenException(
        'Store operators may only mark an order as PREPARING or READY_FOR_PICKUP.',
      );
    }

    if (!canTransitionOrder(order.currentStatus, status)) {
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
          changedById: actor.id,
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

  async cancel(userId: number, id: number, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM \`Order\` WHERE id = ${id} FOR UPDATE`;
      const order = await tx.order.findFirst({
        where: { id, userId },
        include: { items: true, allocations: { include: { paymentGroup: true } } },
      });
      if (!order) throw new NotFoundException('Order not found.');
      if (!['CONFIRMED', 'PREPARING'].includes(order.currentStatus))
        throw new BadRequestException('This order can no longer be cancelled.');
      for (const item of order.items)
        await tx.storeProduct.update({
          where: { id: item.storeProductId },
          data: { stockQuantity: { increment: item.quantity } },
        });
      await tx.order.update({ where: { id }, data: { currentStatus: 'CANCELLED' } });
      await tx.delivery.updateMany({ where: { orderId: id }, data: { status: 'CANCELLED' } });
      await tx.pickup.updateMany({ where: { orderId: id }, data: { status: 'cancelled' } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          fromStatus: order.currentStatus,
          toStatus: 'CANCELLED',
          changedById: userId,
          reason,
        },
      });
      const allocation = order.allocations[0];
      let refundStatus = 'manual_pending';
      if (allocation?.paymentGroup.paymentMethod === 'WALLET') {
        const wallet = await tx.wallet.upsert({
          where: { userId },
          create: { userId, balance: order.total },
          update: { balance: { increment: order.total } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount: order.total,
            type: 'CREDIT',
            reference: `ORDER-CANCEL-${id}`,
            description: `Refund for ${order.orderNumber}`,
          },
        });
        refundStatus = 'refunded';
      }
      const storeWallet = await tx.storeWallet.findUnique({ where: { storeId: order.storeId } });
      const settlement = await tx.storeWalletTransaction.findUnique({
        where: { reference: `ORDER-${order.orderNumber}` },
      });
      if (storeWallet && settlement) {
        await tx.storeWallet.update({
          where: { id: storeWallet.id },
          data: { balance: { decrement: settlement.amount } },
        });
        await tx.storeWalletTransaction.create({
          data: {
            walletId: storeWallet.id,
            amount: settlement.amount,
            type: 'DEBIT',
            reference: `ORDER-CANCEL-${order.orderNumber}`,
            orderId: id,
            description: 'Settlement reversal after customer cancellation',
          },
        });
      }
      await tx.cashbackReward.updateMany({
        where: { orderId: id, status: 'AVAILABLE' },
        data: { status: 'REVERSED' },
      });
      return { orderId: id, status: 'cancelled', refundStatus };
    });
  }

  async requestReturn(userId: number, id: number, dto: ReturnOrderDto) {
    const order = await this.prisma.order.findFirst({
      where: { id, userId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (!['DELIVERED', 'COMPLETED'].includes(order.currentStatus))
      throw new BadRequestException('Only delivered orders can be returned.');
    if (Date.now() - order.updatedAt.getTime() > 14 * 24 * 60 * 60 * 1000)
      throw new BadRequestException('The 14-day return window has expired.');
    const active = await this.prisma.orderReturn.findFirst({
      where: { orderId: id, status: { in: ['PENDING', 'APPROVED'] } },
    });
    if (active)
      throw new ConflictException('An active return request already exists for this order.');
    if (
      dto.items?.some((requested) => {
        const item = order.items.find((value) => value.id === requested.orderItemId);
        return !item || requested.quantity < 1 || requested.quantity > item.quantity;
      })
    )
      throw new BadRequestException('Return items or quantities are invalid.');
    return this.prisma.orderReturn.create({
      data: {
        orderId: id,
        userId,
        reason: dto.reason,
        details: dto.details,
        items: dto.items as Prisma.InputJsonValue | undefined,
        evidenceUrls: dto.evidenceUrls as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
