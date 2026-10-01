import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationPriority, NotificationType, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationListQueryDto, UpdateNotificationPreferenceDto } from './dto/notification.dto';

interface NotifyUserInput {
  userId: number;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  data?: Prisma.InputJsonValue;
  templateKey?: Parameters<MailService['sendTemplate']>[0];
  templateData?: Record<string, unknown>;
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationsService.name);
  private orderConfirmationTimer?: NodeJS.Timeout;
  private processingOrderConfirmations = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    void this.processOrderConfirmations().catch((error: unknown) =>
      this.logger.error('Initial order confirmation dispatch failed', error),
    );
    this.orderConfirmationTimer = setInterval(() => {
      void this.processOrderConfirmations().catch((error: unknown) =>
        this.logger.error('Order confirmation dispatch failed', error),
      );
    }, 60_000);
    this.orderConfirmationTimer.unref();
  }

  onModuleDestroy() {
    if (this.orderConfirmationTimer) clearInterval(this.orderConfirmationTimer);
  }

  async processOrderConfirmations(orderIds?: number[]) {
    if (this.processingOrderConfirmations) return { processed: 0, failed: 0 };
    this.processingOrderConfirmations = true;
    const result = { processed: 0, failed: 0 };
    try {
      const now = new Date();
      await this.prisma.orderConfirmationOutbox.updateMany({
        where: {
          status: 'PROCESSING',
          processingAt: { lt: new Date(now.getTime() - 10 * 60_000) },
        },
        data: { status: 'PENDING', processingAt: null },
      });
      const jobs = await this.prisma.orderConfirmationOutbox.findMany({
        where: {
          ...(orderIds?.length ? { orderId: { in: orderIds } } : {}),
          status: { in: ['PENDING', 'FAILED'] },
          availableAt: { lte: now },
        },
        orderBy: { createdAt: 'asc' },
        take: 25,
        select: { id: true },
      });
      for (const job of jobs) {
        const claimed = await this.prisma.orderConfirmationOutbox.updateMany({
          where: { id: job.id, status: { in: ['PENDING', 'FAILED'] }, availableAt: { lte: now } },
          data: { status: 'PROCESSING', processingAt: new Date(), attempts: { increment: 1 } },
        });
        if (claimed.count !== 1) continue;
        try {
          await this.dispatchOrderConfirmation(job.id);
          result.processed++;
        } catch (error) {
          result.failed++;
          const message = error instanceof Error ? error.message : 'Unknown dispatch error';
          const current = await this.prisma.orderConfirmationOutbox.findUnique({
            where: { id: job.id },
            select: { attempts: true },
          });
          const delayMinutes = Math.min(60, 2 ** Math.min(current?.attempts ?? 1, 6));
          await this.prisma.orderConfirmationOutbox.update({
            where: { id: job.id },
            data: {
              status: 'FAILED',
              processingAt: null,
              lastError: message,
              availableAt: new Date(Date.now() + delayMinutes * 60_000),
            },
          });
          this.logger.error(`Order confirmation job ${job.id} failed`, error);
        }
      }
      return result;
    } finally {
      this.processingOrderConfirmations = false;
    }
  }

  private async dispatchOrderConfirmation(jobId: number) {
    const job = await this.prisma.orderConfirmationOutbox.findUniqueOrThrow({
      where: { id: jobId },
      include: {
        user: { select: { id: true, email: true, firstName: true } },
        order: {
          include: {
            store: { select: { storeName: true } },
            items: {
              select: { productName: true, quantity: true, unitPrice: true, totalPrice: true },
            },
            allocations: {
              take: 1,
              include: { paymentGroup: { select: { paymentMethod: true } } },
            },
          },
        },
      },
    });
    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId: job.userId, type: 'ORDER_PLACED' } },
    });
    const eventKey = `order-placed:${job.orderId}`;
    const fulfillmentMessage =
      job.order.fulfillmentType === 'PICKUP'
        ? 'placed successfully and is being prepared for pickup.'
        : 'placed successfully and is being prepared for delivery.';
    if (preference?.inApp ?? true) {
      await this.prisma.notification.upsert({
        where: { eventKey },
        update: {},
        create: {
          eventKey,
          recipientId: job.userId,
          type: 'ORDER_PLACED',
          title: 'Order placed successfully',
          message: `Order ${job.order.orderNumber} was ${fulfillmentMessage}`,
          data: {
            orderId: job.order.id,
            orderNumber: job.order.orderNumber,
            status: job.order.currentStatus,
          },
        },
      });
    }
    if (preference?.email ?? true) {
      await this.mail.sendTemplate(
        'orderPlaced',
        job.user.email,
        {
          firstName: job.user.firstName ?? undefined,
          orderId: job.order.id,
          orderNumber: job.order.orderNumber,
          storeName: job.order.store.storeName,
          total: job.order.total,
          subtotal: job.order.subtotal,
          shippingFee: job.order.shippingFee,
          paymentMethod: job.order.allocations[0]?.paymentGroup.paymentMethod ?? 'CARD',
          fulfillmentType: job.order.fulfillmentType,
          deliveryAddress: job.order.deliveryAddress,
          items: job.order.items.map((item) => ({
            name: item.productName,
            quantity: item.quantity,
            unitPrice: item.unitPrice.toString(),
            total: item.totalPrice.toString(),
          })),
        },
        job.user.id,
        eventKey,
      );
    }
    await this.prisma.orderConfirmationOutbox.update({
      where: { id: job.id },
      data: { status: 'PROCESSED', processedAt: new Date(), processingAt: null, lastError: null },
    });
  }

  async notifyUser(input: NotifyUserInput) {
    const user = await this.prisma.user.findUnique({
      where: { id: input.userId },
      select: { id: true, email: true, firstName: true },
    });

    if (!user) {
      throw new NotFoundException('Notification recipient not found.');
    }

    const preference = await this.prisma.notificationPreference.findUnique({
      where: { userId_type: { userId: input.userId, type: input.type } },
    });

    const inAppEnabled = preference?.inApp ?? true;
    const emailEnabled = preference?.email ?? true;

    let notification = null;
    if (inAppEnabled) {
      notification = await this.prisma.notification.create({
        data: {
          recipientId: user.id,
          type: input.type,
          title: input.title,
          message: input.message,
          priority: input.priority ?? 'MEDIUM',
          data: input.data,
        },
      });
    }

    if (emailEnabled && input.templateKey) {
      try {
        await this.mail.sendTemplate(
          input.templateKey,
          user.email,
          {
            appName: this.config.get<string>('APP_NAME', 'Purse'),
            firstName: user.firstName ?? undefined,
            ...(input.templateData ?? {}),
          },
          user.id,
        );
      } catch (error) {
        this.logger.error('Failed to send notification email', error);
      }
    }

    return notification;
  }

  async list(userId: number, query: NotificationListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 15;
    const where = {
      recipientId: userId,
      ...(query.unreadOnly ? { isRead: false } : {}),
    };

    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { recipientId: userId, isRead: false } }),
    ]);

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      unreadCount: unread,
    };
  }

  async unreadCount(userId: number) {
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
    return { unreadCount: count };
  }

  async read(userId: number, id: number) {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientId: userId },
      data: { isRead: true, readAt: new Date() },
    });

    if (result.count === 0) {
      throw new NotFoundException('Notification not found.');
    }

    return this.prisma.notification.findUnique({ where: { id } });
  }

  async readAll(userId: number) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientId: userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  async preferences(userId: number) {
    return this.prisma.notificationPreference.findMany({
      where: { userId },
      orderBy: { type: 'asc' },
    });
  }

  async updatePreference(userId: number, dto: UpdateNotificationPreferenceDto) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_type: { userId, type: dto.type } },
      create: { userId, type: dto.type, inApp: dto.inApp ?? true, email: dto.email ?? true },
      update: {
        ...(dto.inApp === undefined ? {} : { inApp: dto.inApp }),
        ...(dto.email === undefined ? {} : { email: dto.email }),
      },
    });
  }
}
