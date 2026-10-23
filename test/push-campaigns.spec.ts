import { BadRequestException } from '@nestjs/common';

import { PushCampaignsService } from '../src/notifications/push-campaigns.service';
import { NotificationsService } from '../src/notifications/notifications.service';

const campaign = {
  id: 12,
  title: 'Weekend delivery offer',
  message: 'Enjoy free delivery this weekend.',
  imageUrl: null,
  deepLink: 'superstore://campaigns/weekend',
  audienceType: 'CUSTOMERS' as const,
  audienceFilter: {},
  includeInApp: true,
  status: 'SENDING' as const,
  approvalStatus: 'NOT_REQUIRED' as const,
  rejectionReason: null,
  reviewedAt: null,
  scheduledAt: new Date(),
  startedAt: new Date(),
  sentAt: null,
  cancelledAt: null,
  totalRecipients: 0,
  deliveredCount: 0,
  failedCount: 0,
  skippedCount: 0,
  lastError: null,
  createdById: 1,
  createdByUserId: null,
  storeId: null,
  reviewedById: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('PushCampaignsService', () => {
  it('requires recipient IDs for a selected-user audience', async () => {
    const service = new PushCampaignsService({} as never, {} as never);

    await expect(
      service.create(
        {
          title: 'Selected offer',
          message: 'Only for selected customers.',
          audience: { type: 'SELECTED_USERS' },
        },
        1,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('caps admin campaign listings at 15 items', async () => {
    const prisma = {
      pushCampaign: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };
    const service = new PushCampaignsService(prisma as never, {} as never);

    const result = await service.list({ page: 1, limit: 50 } as never);

    expect(prisma.pushCampaign.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 15 }),
    );
    expect(result.pagination.limit).toBe(15);
  });

  it('dispatches due campaigns, records recipient results, and completes the campaign', async () => {
    const prisma = {
      pushCampaign: {
        updateMany: jest
          .fn()
          .mockResolvedValueOnce({ count: 0 })
          .mockResolvedValueOnce({ count: 1 })
          .mockResolvedValueOnce({ count: 1 }),
        findMany: jest.fn().mockResolvedValue([{ id: 12 }]),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(campaign)
          .mockResolvedValueOnce({ status: 'SENDING' })
          .mockResolvedValueOnce({ status: 'SENDING' }),
        update: jest.fn().mockResolvedValue(campaign),
      },
      pushCampaignDelivery: {
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([{ id: 90, campaignId: 12, userId: 8, status: 'PENDING' }])
          .mockResolvedValueOnce([]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0).mockResolvedValueOnce(0),
      },
      user: {
        findMany: jest.fn().mockResolvedValue([{ id: 8 }]),
      },
    };
    const notifications = {
      notifyMarketingUser: jest.fn().mockResolvedValue({
        inAppDelivered: true,
        optedOut: false,
        push: { enabled: true, attempted: 1, successful: 1, failed: 0 },
      }),
    };
    const service = new PushCampaignsService(prisma as never, notifications as never);

    await service.processDueCampaigns();

    expect(notifications.notifyMarketingUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 8, campaignId: 12, title: campaign.title }),
    );
    expect(prisma.pushCampaignDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 90 },
        data: expect.objectContaining({
          status: 'DELIVERED',
          pushAttempted: 1,
          pushSuccessful: 1,
        }),
      }),
    );
    expect(prisma.pushCampaign.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: 12, status: 'SENDING' },
        data: expect.objectContaining({ status: 'SENT', deliveredCount: 1 }),
      }),
    );
  });

  it('uses MARKETING preferences for a test send and writes an audit event', async () => {
    const prisma = {
      pushCampaign: { findUnique: jest.fn().mockResolvedValue({ ...campaign, status: 'DRAFT' }) },
      auditLog: { create: jest.fn().mockResolvedValue({ id: 3 }) },
    };
    const notifications = {
      notifyMarketingUser: jest.fn().mockResolvedValue({
        inAppDelivered: false,
        optedOut: true,
        push: { enabled: true, attempted: 0, successful: 0, failed: 0 },
      }),
    };
    const service = new PushCampaignsService(prisma as never, notifications as never);

    const result = await service.test(12, 8, 1);

    expect(notifications.notifyMarketingUser).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 8, campaignId: 12, test: true }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'PUSH_CAMPAIGN_TEST_SENT',
          permission: 'notifications.send',
        }),
      }),
    );
    expect(result.optedOut).toBe(true);
  });
});

describe('NotificationsService marketing preferences', () => {
  it('does not create in-app or push advertising when the user opted out', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 8 }) },
      notificationPreference: {
        findUnique: jest.fn().mockResolvedValue({ inApp: false, email: false, push: false }),
      },
      notification: {
        create: jest.fn(),
        upsert: jest.fn(),
      },
    };
    const gateway = { created: jest.fn() };
    const push = { send: jest.fn() };
    const config = { get: jest.fn().mockReturnValue('{}') };
    const service = new NotificationsService(
      prisma as never,
      {} as never,
      config as never,
      gateway as never,
      push as never,
    );

    const result = await service.notifyMarketingUser({
      userId: 8,
      campaignId: 12,
      title: 'Weekend offer',
      message: 'Save on delivery.',
      includeInApp: true,
    });

    expect(result.optedOut).toBe(true);
    expect(prisma.notification.create).not.toHaveBeenCalled();
    expect(prisma.notification.upsert).not.toHaveBeenCalled();
    expect(gateway.created).not.toHaveBeenCalled();
    expect(push.send).not.toHaveBeenCalled();
  });
});
