import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

interface CheckoutInput {
  fulfillmentType: 'PICKUP' | 'DELIVERY';
  address?: {
    label?: string;
    state?: string;
    city?: string;
    address: string;
  };
  deliveryFee?: number;
}

/** Items at or below this quantity trigger a low-stock alert to the vendor. */
const LOW_STOCK_THRESHOLD = 5;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: number, input: CheckoutInput) {
    if (input.fulfillmentType === 'DELIVERY' && !input.address?.address) {
      throw new BadRequestException('Delivery address is required.');
    }

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            storeProduct: {
              include: {
                product: { include: { images: true } },
                store: true,
              },
            },
          },
        },
      },
    });

    if (!cart?.items.length) {
      throw new BadRequestException('Cart is empty.');
    }

    const grouped = new Map<number, typeof cart.items>();

    for (const item of cart.items) {
      const storeId = item.storeProduct.storeId;
      const storeItems = grouped.get(storeId) ?? [];
      storeItems.push(item);
      grouped.set(storeId, storeItems);
    }

    const deliveryFee = input.fulfillmentType === 'DELIVERY' ? Number(input.deliveryFee ?? 0) : 0;

    const customer = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!customer) {
      throw new BadRequestException('Customer not found.');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      let paymentGroupTotal = 0;
      const orders = [];
      const stockAlerts: Array<{
        storeOwnerUserId: number;
        productName: string;
        storeName: string;
        sku: string | null;
        remaining: number;
      }> = [];

      for (const [storeId, items] of grouped.entries()) {
        for (const item of items) {
          const liveOffer = await tx.storeProduct.findUnique({
            where: { id: item.storeProductId },
          });

          if (
            !liveOffer ||
            !liveOffer.isActive ||
            !liveOffer.availability ||
            liveOffer.stockQuantity < item.quantity
          ) {
            throw new BadRequestException(
              `Product ${item.storeProduct.product.name} is not available in the requested quantity.`,
            );
          }
        }

        const subtotal = items.reduce(
          (sum, item) => sum + Number(item.unitPrice) * item.quantity,
          0,
        );
        const total = subtotal + deliveryFee;

        const order = await tx.order.create({
          data: {
            orderNumber: this.createOrderNumber(),
            userId,
            storeId,
            fulfillmentType: input.fulfillmentType,
            customerName:
              [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email,
            customerEmail: customer.email,
            customerPhone: customer.phoneNumber,
            deliveryLabel: input.address?.label,
            deliveryState: input.address?.state,
            deliveryCity: input.address?.city,
            deliveryAddress: input.address?.address,
            subtotal,
            shippingFee: deliveryFee,
            total,
            items: {
              create: items.map((item) => ({
                storeProductId: item.storeProductId,
                productId: item.storeProduct.productId,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                totalPrice: Number(item.unitPrice) * item.quantity,
                productName: item.storeProduct.product.name,
                productCode: item.storeProduct.sku,
                productImage: item.storeProduct.product.images[0]?.url,
              })),
            },
          },
        });

        // ── Stock decrement + auto-disable when reaching zero ──────────────

        for (const item of items) {
          const updated = await tx.storeProduct.update({
            where: { id: item.storeProductId },
            data: {
              stockQuantity: { decrement: item.quantity },
              // Auto-hide the product when stock reaches zero
              ...(item.storeProduct.stockQuantity - item.quantity <= 0
                ? { availability: false }
                : {}),
            },
          });

          const remaining = updated.stockQuantity;

          if (remaining <= LOW_STOCK_THRESHOLD) {
            stockAlerts.push({
              storeOwnerUserId: item.storeProduct.store.ownerUserId,
              productName: item.storeProduct.product.name,
              storeName: item.storeProduct.store.storeName,
              sku: item.storeProduct.sku,
              remaining,
            });
          }
        }

        if (input.fulfillmentType === 'PICKUP') {
          await tx.pickup.create({
            data: {
              orderId: order.id,
              codeHash: randomUUID(),
              qrToken: randomUUID(),
            },
          });
        } else {
          await tx.delivery.create({
            data: {
              orderId: order.id,
              deliveryAddress: input.address!.address,
              deliveryLabel: input.address?.label,
              deliveryState: input.address?.state,
              deliveryCity: input.address?.city,
            },
          });
        }

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            toStatus: 'ORDER_RECEIVED',
          },
        });

        paymentGroupTotal += total;
        orders.push(order);
      }

      const paymentGroup = await tx.checkoutPaymentGroup.create({
        data: {
          userId,
          totalAmount: paymentGroupTotal,
          allocations: {
            create: orders.map((order) => ({
              orderId: order.id,
              amount: order.total,
            })),
          },
        },
        include: { allocations: true },
      });

      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.cart.update({
        where: { id: cart.id },
        data: {
          subtotal: 0,
          totalItems: 0,
        },
      });

      return {
        paymentGroup,
        orders,
        stockAlerts,
      };
    });

    await Promise.all(
      result.orders.map((order) =>
        this.notifications.notifyUser({
          userId,
          type: 'ORDER_PLACED',
          title: 'Order received',
          message: `Your order ${order.orderNumber} has been received.`,
          data: { orderId: order.id, orderNumber: order.orderNumber },
          templateKey: 'orderPlaced',
          templateData: { orderNumber: order.orderNumber, total: String(order.total) },
        }),
      ),
    );

    // ── Stock alert notifications to vendors ──────────────────────────────
    // Use allSettled so one failing notification never blocks the others.
    await Promise.allSettled(
      result.stockAlerts.map((alert) => {
        const isOutOfStock = alert.remaining === 0;
        return this.notifications.notifyUser({
          userId: alert.storeOwnerUserId,
          type: 'PRODUCT_OUT_OF_STOCK',
          priority: isOutOfStock ? 'HIGH' : 'MEDIUM',
          title: isOutOfStock
            ? `🚫 ${alert.productName} is out of stock`
            : `⚠️ Low stock alert: ${alert.productName}`,
          message: isOutOfStock
            ? `${alert.productName} in ${alert.storeName} has sold out and has been hidden from customers.`
            : `${alert.productName} in ${alert.storeName} is running low — only ${alert.remaining} unit(s) left.`,
          data: {
            productName: alert.productName,
            storeName: alert.storeName,
            remaining: alert.remaining,
            sku: alert.sku,
          },
          // Only send email for out-of-stock (avoid email spam for low-stock).
          ...(isOutOfStock
            ? {
                templateKey: 'lowStock' as const,
                templateData: {
                  productName: alert.productName,
                  storeName: alert.storeName,
                  remaining: alert.remaining,
                  sku: alert.sku,
                },
              }
            : {}),
        });
      }),
    );

    return result;
  }

  private createOrderNumber(): string {
    return `PUR-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}
