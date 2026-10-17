import { ChatsService } from '../src/chats/chats.service';
import { RewardsService } from '../src/rewards/rewards.service';
import { SupportService } from '../src/support/support.service';

describe('notification event coverage', () => {
  it('notifies every other chat participant when a message is created', async () => {
    const message = {
      id: 50,
      body: 'Your order is ready.',
      createdAt: new Date(),
      sender: { id: 10, firstName: 'Ada', lastName: 'Okafor', avatarUrl: null },
    };
    const prisma = {
      chatConversation: {
        findUnique: jest.fn().mockResolvedValue({
          id: 4,
          participantId: 10,
          adminId: null,
          storeId: 8,
          orderId: 501,
          store: { ownerUserId: 20, members: [{ userId: 21 }] },
        }),
        update: jest.fn(),
      },
      chatMessage: { create: jest.fn().mockResolvedValue(message) },
    };
    const notifications = { notifyUser: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = new ChatsService(prisma as never, notifications as never);

    await service.send(10, 4, message.body);

    expect(notifications.notifyUser).toHaveBeenCalledTimes(2);
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 20,
        type: 'CHAT_MESSAGE',
        eventKey: 'chat-message:50:20',
      }),
    );
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 21, eventKey: 'chat-message:50:21' }),
    );
  });

  it('notifies the ticket owner when support replies', async () => {
    const prisma = {
      supportTicket: {
        findUnique: jest.fn().mockResolvedValue({
          id: 9,
          userId: 7,
          ticketNumber: 'SUP-9',
        }),
        update: jest.fn(),
      },
      supportReply: { create: jest.fn().mockResolvedValue({ id: 91 }) },
    };
    const notifications = { notifyUser: jest.fn() };
    const service = new SupportService(prisma as never, notifications as never);

    await service.adminReply(9, 'We have resolved this issue.');

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        type: 'SUPPORT_REPLY',
        eventKey: 'support-reply:91',
      }),
    );
  });

  it('notifies a customer after claiming a new voucher', async () => {
    const tx = {
      rewardVoucher: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ id: 'voucher-1', title: 'Free delivery', pointsCost: 0 }),
      },
      userVoucher: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 3, userId: 7, voucherId: 'voucher-1' }),
      },
      rewardAccount: {
        upsert: jest.fn().mockResolvedValue({ availablePoints: 10 }),
        update: jest.fn(),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const notifications = { notifyUser: jest.fn() };
    const service = new RewardsService(prisma as never, notifications as never);

    await service.claim(7, 'voucher-1');

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 7,
        type: 'REWARD_UPDATE',
        eventKey: 'voucher-claimed:voucher-1:7',
      }),
    );
  });
});
