import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';

import { PrismaService } from '../prisma/prisma.service';
import { SettlementsService } from '../settlements/settlements.service';
import { PaystackClient } from './paystack.client';
import { NotificationsService } from '../notifications/notifications.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClient,
    private readonly notifications: NotificationsService,
    private readonly settlements: SettlementsService,
  ) {}

  async initialize(userId: number, paymentGroupId: number) {
    const group = await this.prisma.checkoutPaymentGroup.findFirst({
      where: {
        id: paymentGroupId,
        userId,
      },
      include: {
        user: true,
        payment: true,
      },
    });

    if (!group) {
      throw new BadRequestException('Checkout payment group not found.');
    }

    
    if (group.status === 'PAID') {
      return {
        status: 'paid',
        paymentId: group.paymentId,
      };
    }

    
    
    
    if (group.status === 'PROCESSING' && group.payment) {
      return group.payment;
    }

    
    
    
    
    
    const reference = `PUR-${group.id}-${randomUUID()}`;
    const initialized = await this.paystack.initialize(
      reference,
      group.user.email,
      Number(group.totalAmount),
    );

    
    
    const payment = await this.prisma.$transaction(async (tx) => {
      const newPayment = await tx.payment.create({
        data: {
          amount: group.totalAmount,
          paymentMethod: 'CARD',
          provider: 'PAYSTACK',
          transactionRef: reference,
          providerRef: initialized.reference,
          paymentUrl: initialized.authorization_url,
          status: 'PENDING',
        },
      });

      await tx.checkoutPaymentGroup.update({
        where: { id: group.id },
        data: {
          paymentId: newPayment.id,
          status: 'PROCESSING',
        },
      });

      return newPayment;
    });

    return payment;
  }

  async handleWebhook(event: Record<string, unknown>) {
    const data = event.data as Record<string, unknown> | undefined;
    const reference = typeof data?.reference === 'string' ? data.reference : null;
    const eventName = typeof event.event === 'string' ? event.event : 'unknown';

    if (!reference) {
      return { received: true };
    }

    const existing = await this.prisma.paymentWebhookEvent.findUnique({
      where: { eventId: reference },
    });

    if (existing?.processed) {
      return { received: true };
    }

    await this.prisma.paymentWebhookEvent.upsert({
      where: { eventId: reference },
      create: {
        provider: 'PAYSTACK',
        eventId: reference,
        eventType: eventName,
        payload: event as unknown as Prisma.InputJsonObject,
      },
      update: {},
    });

    const verified = await this.paystack.verify(reference);
    const payment = await this.prisma.payment.findUnique({
      where: { transactionRef: reference },
      include: { groups: true },
    });

    if (!payment) {
      return { received: true };
    }

    const successful = verified.status === 'success';

    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: successful ? 'PAID' : 'FAILED',
          paidAt: successful ? new Date() : undefined,
        },
      });

      for (const group of payment.groups) {
        await tx.checkoutPaymentGroup.update({
          where: { id: group.id },
          data: {
            status: successful ? 'PAID' : 'FAILED',
          },
        });

        if (successful) {
          const allocations = await tx.checkoutPaymentAllocation.findMany({
            where: { paymentGroupId: group.id },
          });

          for (const allocation of allocations) {
            await tx.order.update({
              where: { id: allocation.orderId },
              data: { currentStatus: 'CONFIRMED' },
            });

            await tx.orderStatusHistory.create({
              data: {
                orderId: allocation.orderId,
                fromStatus: 'ORDER_RECEIVED',
                toStatus: 'CONFIRMED',
                reason: 'Payment confirmed by Paystack.',
              },
            });

            
            await this.settlements.settleOrder(allocation.orderId, tx);
          }
        }
      }

      await tx.paymentWebhookEvent.update({
        where: { eventId: reference },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });
    });

    const groups = await this.prisma.checkoutPaymentGroup.findMany({
      where: { paymentId: payment.id },
      include: { allocations: { include: { order: true } } },
    });

    const order = groups[0]?.allocations[0]?.order;
    if (successful && groups[0]?.userId) {
      await this.notifications.notifyUser({
        userId: groups[0].userId,
        type: 'PAYMENT_RECEIVED',
        title: 'Payment received',
        message: `Payment for ${order?.orderNumber ?? reference} was confirmed.`,
        data: { paymentId: payment.id, reference },
        templateKey: 'paymentReceived',
        templateData: {
          orderNumber: order?.orderNumber ?? reference,
          amount: String(payment.amount),
          reference,
        },
      });
    } else if (groups[0]?.userId) {
      await this.notifications.notifyUser({
        userId: groups[0].userId,
        type: 'PAYMENT_FAILED',
        title: 'Payment failed',
        message: `Payment for checkout ${groups[0].id} could not be confirmed.`,
        data: { paymentId: payment.id, reference },
        templateKey: 'paymentFailed',
        templateData: { checkoutId: String(groups[0].id) },
      });
    }

    return { received: true };
  }
}
