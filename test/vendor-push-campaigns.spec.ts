import { ConflictException, HttpException } from '@nestjs/common';

import { PushCampaignsService } from '../src/notifications/push-campaigns.service';

const vendorCampaign = {
  id: 21,
  storeId: 6,
  createdByUserId: 15,
  createdById: null,
  reviewedById: null,
  title: 'Campus weekend offer',
  message: 'Previous customers get free delivery this weekend.',
  imageUrl: null,
  deepLink: 'superstore://stores/6',
  audienceType: 'STORE_CUSTOMERS' as const,
  audienceFilter: { storeId: 6 },
  includeInApp: true,
  status: 'DRAFT' as const,
  approvalStatus: 'PENDING' as const,
  rejectionReason: null,
  reviewedAt: null,
  scheduledAt: null,
  startedAt: null,
  sentAt: null,
  cancelledAt: null,
  totalRecipients: 0,
  deliveredCount: 0,
  failedCount: 0,
  skippedCount: 0,
  lastError: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('Vendor push campaigns', () => {
  it('creates a pending campaign scoped to an approved vendor store', async () => {
    const created = {
      ...vendorCampaign,
      store: { id: 6, storeName: 'Campus Hub', isActive: true },
    };
    const prisma = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, storeName: 'Campus Hub', isActive: true }),
      },
      pushCampaign: { create: jest.fn().mockResolvedValue(created) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    const service = new PushCampaignsService(prisma as never, {} as never);

    const result = await service.createForStore(15, 6, {
      title: 'Campus weekend offer',
      message: 'Previous customers get free delivery this weekend.',
      includeInApp: true,
    });

    expect(prisma.pushCampaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: 6,
          createdByUserId: 15,
          audienceType: 'STORE_CUSTOMERS',
          approvalStatus: 'PENDING',
        }),
      }),
    );
    expect(result.approvalStatus).toBe('PENDING');
  });

  it('does not let an unapproved store create a campaign', async () => {
    const prisma = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, storeName: 'Campus Hub', isActive: false }),
      },
    };
    const service = new PushCampaignsService(prisma as never, {} as never);

    await expect(
      service.createForStore(15, 6, {
        title: 'Campus weekend offer',
        message: 'Previous customers get free delivery this weekend.',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires admin approval before a vendor can send', async () => {
    const prisma = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, storeName: 'Campus Hub', isActive: true }),
      },
      pushCampaign: { findFirst: jest.fn().mockResolvedValue(vendorCampaign) },
    };
    const service = new PushCampaignsService(prisma as never, {} as never);

    await expect(service.sendForStore(15, 6, 21)).rejects.toBeInstanceOf(ConflictException);
  });

  it('enforces the three-campaign daily store limit', async () => {
    const prisma = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, storeName: 'Campus Hub', isActive: true }),
      },
      pushCampaign: {
        findFirst: jest.fn().mockResolvedValue({ ...vendorCampaign, approvalStatus: 'APPROVED' }),
        count: jest.fn().mockResolvedValue(3),
      },
    };
    const service = new PushCampaignsService(prisma as never, {} as never);

    const error = await service.sendForStore(15, 6, 21).catch((caught) => caught);

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });

  it('records an admin decision and notifies the vendor', async () => {
    const prisma = {
      pushCampaign: {
        findUnique: jest.fn().mockResolvedValue(vendorCampaign),
        update: jest
          .fn()
          .mockResolvedValue({ ...vendorCampaign, approvalStatus: 'APPROVED', reviewedById: 1 }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    const notifications = { notifyUser: jest.fn().mockResolvedValue({ id: 9 }) };
    const service = new PushCampaignsService(prisma as never, notifications as never);

    const result = await service.reviewVendorCampaign(21, 1, { decision: 'APPROVE' });

    expect(prisma.pushCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 21 },
        data: expect.objectContaining({ approvalStatus: 'APPROVED', reviewedById: 1 }),
      }),
    );
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 15,
        type: 'SYSTEM_ANNOUNCEMENT',
        data: expect.objectContaining({ campaignId: 21, storeId: 6 }),
      }),
    );
    expect(result.approvalStatus).toBe('APPROVED');
  });

  it('returns an edited vendor campaign to draft review', async () => {
    const prisma = {
      pushCampaign: {
        findUnique: jest.fn().mockResolvedValue({
          ...vendorCampaign,
          status: 'SCHEDULED',
          approvalStatus: 'APPROVED',
        }),
        update: jest.fn().mockResolvedValue({
          ...vendorCampaign,
          title: 'Updated campus offer',
          status: 'DRAFT',
          approvalStatus: 'PENDING',
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    const service = new PushCampaignsService(prisma as never, {} as never);

    await service.update(21, { title: 'Updated campus offer' }, 1);

    expect(prisma.pushCampaign.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'Updated campus offer',
          status: 'DRAFT',
          scheduledAt: null,
          approvalStatus: 'PENDING',
        }),
      }),
    );
  });

  it('limits store campaign listings to 15 records', async () => {
    const prisma = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, storeName: 'Campus Hub', isActive: true }),
      },
      pushCampaign: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new PushCampaignsService(prisma as never, {} as never);

    const result = await service.listForStore(15, 6, { page: 1, limit: 50 } as never);

    expect(prisma.pushCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { storeId: 6 }, take: 15 }),
    );
    expect(result.pagination.limit).toBe(15);
  });
});
