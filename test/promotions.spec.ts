import { MarketplacePromotionStatus, MarketplacePromotionType } from '@prisma/client';

import { PromotionsService } from '../src/promotions/promotions.service';

describe('PromotionsService', () => {
  it('returns only active approved promotions for marketplace home', async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        id: 1,
        status: MarketplacePromotionStatus.APPROVED,
        products: [],
      },
    ]);
    const service = new PromotionsService({
      marketplacePromotion: { findMany },
    } as never);

    await expect(service.publicHome()).resolves.toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: MarketplacePromotionStatus.APPROVED,
          store: { isActive: true },
          startsAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });

  it('blocks promotion creation for an inactive store', async () => {
    const service = new PromotionsService({
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, isActive: false }),
      },
    } as never);

    await expect(
      service.create(15, 6, {
        title: 'Black Friday',
        imageUrl: 'https://cdn.example.com/black-friday.png',
        type: MarketplacePromotionType.SEASONAL_SALE,
      }),
    ).rejects.toThrow('The store must be approved and active.');
  });

  it('requires a reason when an administrator rejects a promotion', async () => {
    const service = new PromotionsService({
      marketplacePromotion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: MarketplacePromotionStatus.PENDING,
          products: [],
        }),
      },
    } as never);

    await expect(service.review(3, 1, { decision: 'REJECTED' })).rejects.toThrow(
      'A rejection reason is required.',
    );
  });

  it('audits an approved promotion', async () => {
    const tx = {
      marketplacePromotion: {
        update: jest.fn().mockResolvedValue({
          id: 1,
          status: MarketplacePromotionStatus.APPROVED,
          rejectionReason: null,
          products: [],
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new PromotionsService({
      marketplacePromotion: {
        findUnique: jest.fn().mockResolvedValue({
          id: 1,
          status: MarketplacePromotionStatus.PENDING,
          products: [],
        }),
      },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    } as never);

    await expect(service.review(3, 1, { decision: 'APPROVED' })).resolves.toMatchObject({
      status: MarketplacePromotionStatus.APPROVED,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          staffActorId: 3,
          action: 'MARKETPLACE_PROMOTION_APPROVED',
        }),
      }),
    );
  });
});
