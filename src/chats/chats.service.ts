import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
@Injectable()
export class ChatsService {
  constructor(private readonly prisma: PrismaService) {}
  list(userId: number) {
    return this.prisma.chatConversation.findMany({
      where: {
        OR: [
          { participantId: userId },
          { store: { OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] } },
        ],
      },
      include: {
        store: { select: { id: true, storeName: true, imageUrl: true } },
        order: { select: { id: true, orderNumber: true } },
        messages: { take: 1, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
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
    await this.assertMember(userId, id);
    const items = await this.prisma.chatMessage.findMany({
      where: { conversationId: id, id: cursor ? { lt: cursor } : undefined },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
      },
      orderBy: { id: 'desc' },
      take: Math.min(limit, 100),
    });
    return {
      items: items.reverse(),
      nextCursor: items.length === Math.min(limit, 100) ? items[0]?.id : null,
    };
  }
  async send(userId: number, id: number, body: string) {
    await this.assertMember(userId, id);
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
    return message;
  }
}
