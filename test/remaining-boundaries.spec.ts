import { ChatsController } from '../src/chats/chats.controller';
import type { ChatsGateway } from '../src/chats/chats.gateway';
import { ChatsService } from '../src/chats/chats.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { RewardsService } from '../src/rewards/rewards.service';
import type { BankResolverService } from '../src/riders/bank-resolver.service';
import { RidersController } from '../src/riders/riders.controller';
import type { RiderWalletService } from '../src/riders/rider-wallet.service';
import type { RidersService } from '../src/riders/riders.service';
import type { StoreCacService } from '../src/stores/store-cac.service';
import { StoresController } from '../src/stores/stores.controller';
import { StoresService } from '../src/stores/stores.service';
import type { StoreWalletService } from '../src/stores/store-wallet.service';
import { SupportService } from '../src/support/support.service';

describe('Remaining endpoint boundaries', () => {
  it('applies the default 15-record limit to chats and support ticket lists', async () => {
    const prisma = {
      chatConversation: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      supportTicket: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;

    const chats = new ChatsService(prisma);
    const support = new SupportService(prisma);

    await expect(chats.list(1001)).resolves.toMatchObject({ page: 1, limit: 15, total: 0 });
    await expect(support.list(1001)).resolves.toMatchObject({ page: 1, limit: 15, total: 0 });
    await expect(support.adminTickets()).resolves.toMatchObject({ page: 1, limit: 15, total: 0 });

    expect(prisma.chatConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 15 }),
    );
    expect(prisma.supportTicket.findMany).toHaveBeenCalledTimes(2);
    for (const [query] of (prisma.supportTicket.findMany as jest.Mock).mock.calls) {
      expect(query).toEqual(expect.objectContaining({ skip: 0, take: 15 }));
    }
  });

  it('applies the default limit to vouchers and every bounded store directory', async () => {
    const prisma = {
      store: { findFirst: jest.fn().mockResolvedValue({ id: 12 }) },
      rewardVoucher: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      userVoucher: { findMany: jest.fn().mockResolvedValue([]) },
      chatConversation: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      riderProfile: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      storeProduct: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    } as unknown as PrismaService;

    const rewards = new RewardsService(prisma);
    const stores = new StoresService(prisma);

    await expect(rewards.vouchers(1001)).resolves.toMatchObject({ page: 1, limit: 15, total: 0 });
    await stores.campaigns(1101, 12);
    await stores.inbox(1101, 12);
    await stores.riders(1101, 12);
    await stores.compareDeals(1101, 12);

    expect(prisma.rewardVoucher.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 15 }),
    );
    expect(prisma.chatConversation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 15 }),
    );
    expect(prisma.riderProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 15 }),
    );
    expect(prisma.storeProduct.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 15 }),
    );
  });

  it('broadcasts REST-created messages with the Socket.IO chat event path', async () => {
    const message = { id: 803, conversationId: 45, body: 'Order update, please.' };
    const chats = { send: jest.fn().mockResolvedValue(message) } as unknown as ChatsService;
    const gateway = { broadcastMessage: jest.fn() } as unknown as ChatsGateway;
    const controller = new ChatsController(chats, gateway);

    await expect(controller.send(1001, 45, { body: message.body })).resolves.toEqual(message);
    expect(chats.send).toHaveBeenCalledWith(1001, 45, message.body);
    expect(gateway.broadcastMessage).toHaveBeenCalledWith(45, message);
  });

  it('routes dedicated vendor and rider settings updates through existing services', async () => {
    const updatedStore = { id: 12, storeName: 'Updated Lagos Mart' };
    const stores = {
      update: jest.fn().mockResolvedValue(updatedStore),
    } as unknown as StoresService;
    const storeController = new StoresController(
      stores,
      {} as StoreCacService,
      {} as StoreWalletService,
    );
    await expect(
      storeController.updateSettings(1101, 12, { storeName: updatedStore.storeName }),
    ).resolves.toEqual(updatedStore);
    expect(stores.update).toHaveBeenCalledWith(1101, 12, { storeName: updatedStore.storeName });

    const riderSettings = { profile: { areaOfOperation: 'Ikeja' }, notificationPreferences: [] };
    const riders = {
      updateSettings: jest.fn().mockResolvedValue(riderSettings),
    } as unknown as RidersService;
    const riderController = new RidersController(
      riders,
      {} as BankResolverService,
      {} as RiderWalletService,
    );
    const body = { areaOfOperation: 'Ikeja' };
    await expect(riderController.updateSettings(2001, body)).resolves.toEqual(riderSettings);
    expect(riders.updateSettings).toHaveBeenCalledWith(2001, body);
  });
});
