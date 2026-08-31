import { Injectable, NotFoundException } from '@nestjs/common';
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
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

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
      } catch {
        // Email delivery is logged by MailService. In-app notification remains available.
      }
    }

    return notification;
  }

  async list(userId: number, query: NotificationListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
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
