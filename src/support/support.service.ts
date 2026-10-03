import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSupportTicketDto, UpdateSupportTicketDto } from './dto/support.dto';
@Injectable()
export class SupportService {
  constructor(private readonly prisma: PrismaService) {}
  async create(userId: number, dto: CreateSupportTicketDto) {
    if (dto.orderId && !(await this.prisma.order.findFirst({ where: { id: dto.orderId, userId } })))
      throw new NotFoundException('Order not found.');
    return this.prisma.supportTicket.create({
      data: {
        userId,
        orderId: dto.orderId,
        category: dto.category,
        subject: dto.subject,
        description: dto.description,
        attachments: dto.attachments as Prisma.InputJsonValue | undefined,
        ticketNumber: `SUP-${Date.now()}-${randomBytes(3).toString('hex').toUpperCase()}`,
      },
    });
  }
  async list(userId: number, page = 1, limit = 15) {
    const where = { userId };
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
  async one(userId: number, id: number) {
    const ticket = await this.prisma.supportTicket.findFirst({
      where: { id, userId },
      include: { replies: { orderBy: { createdAt: 'asc' } } },
    });
    if (!ticket) throw new NotFoundException('Support ticket not found.');
    return ticket;
  }
  async reply(userId: number, id: number, body: string) {
    const ticket = await this.prisma.supportTicket.findFirst({ where: { id, userId } });
    if (!ticket) throw new NotFoundException('Support ticket not found.');
    if (ticket.status === 'CLOSED') throw new NotFoundException('Support ticket is closed.');
    const reply = await this.prisma.supportReply.create({
      data: { ticketId: id, authorId: userId, body: body.trim() },
    });
    await this.prisma.supportTicket.update({ where: { id }, data: { status: 'OPEN' } });
    return reply;
  }
  faqs(category?: string) {
    return this.prisma.supportFaq.findMany({
      where: { isPublished: true, category: category || undefined },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
  }
  async adminTickets(page = 1, limit = 15, status?: string) {
    const where = { status: status || undefined };
    const [items, total] = await Promise.all([
      this.prisma.supportTicket.findMany({
        where,
        include: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.supportTicket.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
  updateTicket(id: number, dto: UpdateSupportTicketDto) {
    return this.prisma.supportTicket.update({ where: { id }, data: dto });
  }
  async adminReply(id: number, body: string) {
    const ticket = await this.prisma.supportTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Support ticket not found.');
    const reply = await this.prisma.supportReply.create({
      data: { ticketId: id, body: body.trim() },
    });
    await this.prisma.supportTicket.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });
    return reply;
  }
}
