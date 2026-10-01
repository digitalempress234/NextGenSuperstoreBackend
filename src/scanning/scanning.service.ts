import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SettlementsService } from '../settlements/settlements.service';
import { completeOrder } from '../orders/complete-order';

type Phase = 'PACKING' | 'RIDER_PICKUP';

@Injectable()
export class ScanningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly settlements: SettlementsService,
  ) {}

  private hash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private token(payload: string) {
    const trimmed = payload.trim();
    if (!trimmed.startsWith('purse://')) return trimmed;
    try {
      const value = new URL(trimmed).searchParams.get('token');
      if (!value) throw new Error();
      return value;
    } catch {
      throw new BadRequestException('Malformed order QR payload.');
    }
  }
  private async issue(orderId: number, purpose: string, force = false) {
    const now = new Date();
    const existing = await this.prisma.orderQrCredential.findFirst({
      where: { orderId, purpose, status: 'ACTIVE', expiresAt: { gt: now } },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && !force)
      throw new ConflictException(
        'A valid QR already exists. Regenerate it to replace the current credential.',
      );
    if (force)
      await this.prisma.orderQrCredential.updateMany({
        where: { orderId, purpose, status: 'ACTIVE' },
        data: { status: 'REVOKED', revokedAt: now },
      });
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(now.getTime() + 30 * 60 * 1000);
    const credential = await this.prisma.orderQrCredential.create({
      data: { orderId, purpose, tokenHash: this.hash(token), expiresAt },
    });
    const qrPayload = `purse://order-handoff?token=${encodeURIComponent(token)}`;
    return {
      credentialId: credential.id,
      orderId,
      purpose,
      qrPayload,
      qrImage: await QRCode.toDataURL(qrPayload, {
        errorCorrectionLevel: 'M',
        width: 360,
        margin: 2,
      }),
      expiresAt,
      status: 'active',
    };
  }
  async customerQr(userId: number, orderId: number, regenerate = false) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      include: { delivery: true, pickup: true },
    });
    if (!order) throw new NotFoundException('Order not found.');
    if (['ORDER_RECEIVED', 'CANCELLED'].includes(order.currentStatus))
      throw new BadRequestException('A QR is unavailable for this order state.');
    return this.issue(orderId, order.delivery ? 'CUSTOMER_DELIVERY' : 'STORE_PICKUP', regenerate);
  }
  private async storeAccess(userId: number, storeId: number) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
    });
    if (!store) throw new ForbiddenException('Store access is required.');
  }
  async handoffQr(userId: number, storeId: number, orderId: number) {
    await this.storeAccess(userId, storeId);
    const order = await this.prisma.order.findFirst({ where: { id: orderId, storeId } });
    if (!order) throw new NotFoundException('Order not found.');
    if (!['READY_FOR_PICKUP', 'RIDER_ASSIGNED'].includes(order.currentStatus))
      throw new BadRequestException('Order is not ready for rider handoff.');
    return this.issue(orderId, 'RIDER_PICKUP', true);
  }
  private async riderOrder(riderId: number, orderId: number) {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, delivery: { riderId } },
      include: { delivery: true, items: { include: { product: true, storeProduct: true } } },
    });
    if (!order) throw new ForbiddenException('This order is not assigned to the rider.');
    return order;
  }
  async scanOrder(riderId: number, payload: string) {
    const credential = await this.prisma.orderQrCredential.findUnique({
      where: { tokenHash: this.hash(this.token(payload)) },
      include: { order: { include: { delivery: true } } },
    });
    if (!credential) throw new NotFoundException('Order QR is invalid.');
    const failure =
      credential.status !== 'ACTIVE'
        ? 'QR is no longer active.'
        : credential.expiresAt <= new Date()
          ? 'QR has expired.'
          : credential.order.delivery?.riderId !== riderId
            ? 'Order is not assigned to this rider.'
            : null;
    await this.prisma.orderScan.create({
      data: {
        orderId: credential.orderId,
        credentialId: credential.id,
        actorId: riderId,
        purpose: credential.purpose,
        outcome: failure ? 'REJECTED' : 'VERIFIED',
        failureReason: failure,
      },
    });
    if (failure) throw new ForbiddenException(failure);
    return {
      verified: true,
      orderId: credential.orderId,
      orderNumber: credential.order.orderNumber,
      purpose: credential.purpose,
      expiresAt: credential.expiresAt,
      checklist: await this.checklist(riderId, credential.orderId, 'RIDER_PICKUP'),
    };
  }
  async checklist(actorId: number, orderId: number, phase: Phase, storeId?: number) {
    const order =
      phase === 'RIDER_PICKUP'
        ? await this.riderOrder(actorId, orderId)
        : await this.prisma.order.findFirst({
            where: { id: orderId, storeId },
            include: { items: { include: { product: true, storeProduct: true } } },
          });
    if (!order) throw new NotFoundException('Order not found.');
    if (phase === 'PACKING') await this.storeAccess(actorId, order.storeId);
    const scans = await this.prisma.orderItemScan.groupBy({
      by: ['orderItemId'],
      where: { orderItem: { orderId }, phase, status: 'VERIFIED' },
      _sum: { quantity: true },
    });
    const quantities = new Map(scans.map((row) => [row.orderItemId, row._sum.quantity ?? 0]));
    return order.items.map((item) => ({
      orderItemId: item.id,
      productId: item.productId,
      productName: item.productName,
      productImage: item.productImage,
      barcode: item.storeProduct.barcode ?? item.product.barcode ?? item.storeProduct.sku,
      expectedQuantity: item.quantity,
      scannedQuantity: quantities.get(item.id) ?? 0,
      complete: (quantities.get(item.id) ?? 0) >= item.quantity,
    }));
  }
  async scanItem(
    actorId: number,
    orderId: number,
    phase: Phase,
    code: string,
    quantity: number,
    storeId?: number,
  ) {
    const checklist = await this.checklist(actorId, orderId, phase, storeId);
    const normalized = code.trim().toUpperCase();
    const item = await this.prisma.orderItem.findFirst({
      where: {
        orderId,
        OR: [
          { productCode: normalized },
          {
            storeProduct: {
              OR: [
                { barcode: normalized },
                { sku: normalized },
                { product: { barcode: normalized } },
              ],
            },
          },
        ],
      },
      include: { storeProduct: true },
    });
    if (!item)
      throw new BadRequestException({
        message: 'Scanned product is not part of this order.',
        data: { code: normalized },
      });
    const progress = checklist.find((row) => row.orderItemId === item.id)!;
    if (progress.scannedQuantity + quantity > item.quantity)
      throw new ConflictException('Scan quantity exceeds the ordered quantity.');
    await this.prisma.orderItemScan.create({
      data: {
        orderItemId: item.id,
        storeProductId: item.storeProductId,
        actorId,
        phase,
        barcode: normalized,
        quantity,
      },
    });
    return this.checklist(actorId, orderId, phase, storeId);
  }
  async completePacking(actorId: number, storeId: number, orderId: number) {
    const checklist = await this.checklist(actorId, orderId, 'PACKING', storeId);
    if (checklist.some((item) => !item.complete))
      throw new ConflictException({
        message: 'Every order item must be scanned before packing is completed.',
        data: { checklist },
      });
    const order = await this.prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!['CONFIRMED', 'PREPARING'].includes(order.currentStatus))
      throw new BadRequestException('Order cannot be marked ready from its current state.');
    await this.prisma.$transaction([
      this.prisma.order.update({
        where: { id: orderId },
        data: { currentStatus: 'READY_FOR_PICKUP' },
      }),
      this.prisma.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.currentStatus,
          toStatus: 'READY_FOR_PICKUP',
          changedById: actorId,
          reason: 'All products scanned and packing completed.',
        },
      }),
    ]);
    return { orderId, status: 'READY_FOR_PICKUP', checklist };
  }
  private async validCredential(orderId: number, purpose: string, payload: string) {
    const credential = await this.prisma.orderQrCredential.findUnique({
      where: { tokenHash: this.hash(this.token(payload)) },
    });
    if (
      !credential ||
      credential.orderId !== orderId ||
      credential.purpose !== purpose ||
      credential.status !== 'ACTIVE'
    )
      throw new ForbiddenException('QR credential is invalid or already used.');
    if (credential.expiresAt <= new Date())
      throw new ForbiddenException('QR credential has expired.');
    return credential;
  }
  async confirmPickup(riderId: number, orderId: number, payload: string) {
    const order = await this.riderOrder(riderId, orderId);
    const credential = await this.validCredential(orderId, 'RIDER_PICKUP', payload);
    const checklist = await this.checklist(riderId, orderId, 'RIDER_PICKUP');
    if (checklist.some((item) => !item.complete))
      throw new ConflictException('Every item must be scanned before pickup confirmation.');
    if (!['READY_FOR_PICKUP', 'RIDER_ASSIGNED'].includes(order.currentStatus))
      throw new BadRequestException('Order is not ready for rider pickup.');
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.orderQrCredential.updateMany({
        where: { id: credential.id, status: 'ACTIVE', expiresAt: { gt: new Date() } },
        data: { status: 'CONSUMED', consumedAt: new Date(), consumedById: riderId },
      });
      if (!consumed.count) throw new ConflictException('QR credential was already consumed.');
      await tx.order.update({ where: { id: orderId }, data: { currentStatus: 'PICKED_UP' } });
      await tx.delivery.update({
        where: { orderId },
        data: { status: 'PICKED_UP', pickedUpAt: new Date() },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.currentStatus,
          toStatus: 'PICKED_UP',
          changedById: riderId,
          reason: 'Rider QR and product checklist verified.',
        },
      });
      await completeOrder(
        tx,
        { ...order, currentStatus: 'DELIVERED' },
        undefined,
        'System completed the order after customer QR verification.',
      );
    });
    return { orderId, status: 'PICKED_UP', verifiedItems: checklist };
  }
  async confirmDelivery(riderId: number, orderId: number, payload: string) {
    const order = await this.riderOrder(riderId, orderId);
    const credential = await this.validCredential(orderId, 'CUSTOMER_DELIVERY', payload);
    if (!['PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.currentStatus))
      throw new BadRequestException('Order is not ready for delivery confirmation.');
    await this.prisma.$transaction(async (tx) => {
      const consumed = await tx.orderQrCredential.updateMany({
        where: { id: credential.id, status: 'ACTIVE', expiresAt: { gt: new Date() } },
        data: { status: 'CONSUMED', consumedAt: new Date(), consumedById: riderId },
      });
      if (!consumed.count) throw new ConflictException('QR credential was already consumed.');
      await tx.order.update({ where: { id: orderId }, data: { currentStatus: 'DELIVERED' } });
      await tx.delivery.update({
        where: { orderId },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      });
      if (order.delivery) {
        await this.settlements.releaseRiderEarning(order.delivery.id, tx);
      }
      await tx.orderStatusHistory.create({
        data: {
          orderId,
          fromStatus: order.currentStatus,
          toStatus: 'DELIVERED',
          changedById: riderId,
          reason: 'Customer delivery QR verified.',
        },
      });
    });
    await this.notifications.notifyUser({
      userId: order.userId,
      type: 'DELIVERY_COMPLETED',
      title: 'Order delivered',
      message: `Your order ${order.orderNumber} has been delivered.`,
      data: { deliveryId: order.delivery?.id, orderId },
      templateKey: 'deliveryCompleted',
      templateData: { orderNumber: order.orderNumber },
    });
    return { orderId, status: 'COMPLETED', deliveryStatus: 'DELIVERED', verified: true };
  }
}
