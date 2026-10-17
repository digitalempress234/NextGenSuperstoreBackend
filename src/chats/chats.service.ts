import { ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
@Injectable()
export class ChatsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}
  async list(userId: number, page = 1, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    const where = {
      OR: [
        { participantId: userId },
        { store: { OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] } },
      ],
    };
    const [items, total] = await Promise.all([
      this.prisma.chatConversation.findMany({
        where,
        include: {
          store: { select: { id: true, storeName: true, imageUrl: true } },
          order: { select: { id: true, orderNumber: true } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatConversation.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
  async create(userId: number, storeId: number, orderId?: number) {
    const store = await this.prisma.store.findFirst({ where: { id: storeId, isActive: true } });
    if (!store) throw new NotFoundException('Store not found.');
    if (
      orderId &&
      !(await this.prisma.order.findFirst({ where: { id: orderId, userId, storeId } }))
    )
      throw new NotFoundException('Order not found.');
    const existing = await this.prisma.chatConversation.findFirst({
      where: { participantId: userId, storeId, orderId: orderId ?? null },
    });
    return (
      existing ??
      this.prisma.chatConversation.create({ data: { participantId: userId, storeId, orderId } })
    );
  }
  async assertMember(userId: number, id: number) {
    const conversation = await this.prisma.chatConversation.findUnique({
      where: { id },
      include: { store: { include: { members: true } } },
    });
    if (!conversation) throw new NotFoundException('Conversation not found.');
    if (
      conversation.participantId !== userId &&
      conversation.adminId !== userId &&
      conversation.store?.ownerUserId !== userId &&
      !conversation.store?.members.some((m) => m.userId === userId)
    )
      throw new ForbiddenException('You do not have access to this conversation.');
    return conversation;
  }
  async messages(userId: number, id: number, cursor?: number, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    await this.assertMember(userId, id);
    const items = await this.prisma.chatMessage.findMany({
      where: { conversationId: id, id: cursor ? { lt: cursor } : undefined },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { id: 'desc' },
      take: limit,
    });
    return {
      items: items.reverse(),
      nextCursor: items.length === limit ? items[0]?.id : null,
    };
  }
  async send(userId: number, id: number, body: string) {
    const conversation = await this.assertMember(userId, id);
    const message = await this.prisma.chatMessage.create({
      data: { conversationId: id, senderId: userId, body: body.trim() },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
    });
    await this.prisma.chatConversation.update({
      where: { id },
      data: { lastMessageAt: message.createdAt },
    });

    const recipients = new Set<number>([
      conversation.participantId,
      ...(conversation.adminId ? [conversation.adminId] : []),
      ...(conversation.store
        ? [
            conversation.store.ownerUserId,
            ...conversation.store.members.map((member) => member.userId),
          ]
        : []),
    ]);
    recipients.delete(userId);
    const senderName =
      [message.sender.firstName, message.sender.lastName].filter(Boolean).join(' ') || 'Someone';
    const preview = message.body.length > 180 ? `${message.body.slice(0, 177)}...` : message.body;
    await Promise.allSettled(
      [...recipients].map((recipientId) =>
        this.notifications?.notifyUser({
          userId: recipientId,
          type: 'CHAT_MESSAGE',
          title: `New message from ${senderName}`,
          message: preview,
          data: {
            conversationId: id,
            messageId: message.id,
            senderId: userId,
            storeId: conversation.storeId,
            orderId: conversation.orderId,
          },
          eventKey: `chat-message:${message.id}:${recipientId}`,
        }),
      ),
    );
    return message;
  }
}
