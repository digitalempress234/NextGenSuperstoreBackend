import { ForbiddenException } from '@nestjs/common';
import { MarketplaceService } from '../src/marketplace/marketplace.service';
import { ScanningService } from '../src/scanning/scanning.service';

describe('QR and product scanning', () => {
  it('resolves a customer product scan to all active offers', async () => {
    const product = { id: 9, barcode: '2000000000009', offers: [{ id: 3 }, { id: 4 }] };
    const prisma = {
      storeProduct: {
        findFirst: jest.fn().mockResolvedValue({ barcode: null, sku: 'SKU-1-9', product }),
      },
    };
    const result = await new MarketplaceService(prisma as never).scan('sku-1-9');
    expect(result.matchType).toBe('sku');
    expect(result.product).toBe(product);
    expect(result.offers).toHaveLength(2);
  });

  it('rejects an order QR scanned by a rider who is not assigned and audits the attempt', async () => {
    const prisma = {
      orderQrCredential: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          orderId: 11,
          purpose: 'RIDER_PICKUP',
          status: 'ACTIVE',
          expiresAt: new Date(Date.now() + 60_000),
          order: { orderNumber: 'PUR-11', delivery: { riderId: 99 } },
        }),
      },
      orderScan: { create: jest.fn().mockResolvedValue({}) },
    };
    const service = new ScanningService(prisma as never, {} as never, {} as never);
    await expect(service.scanOrder(42, 'raw-token')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.orderScan.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ outcome: 'REJECTED', actorId: 42 }),
      }),
    );
  });
});
