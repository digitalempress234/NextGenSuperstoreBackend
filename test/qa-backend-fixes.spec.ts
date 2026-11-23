import type { ConfigService } from '@nestjs/config';

import { IdentroService } from '../src/identro/identro.service';
import { MarketplaceService } from '../src/marketplace/marketplace.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import { StoreAvailabilityService } from '../src/stores/store-availability.service';
import type { CartService } from '../src/cart/cart.service';

type TestHour = {
  dayOfWeek: number;
  opensMinute: number | null;
  closesMinute: number | null;
  isClosed: boolean;
};

const store = (hours: TestHour[] = []) => ({
  id: 10,
  storeName: 'Test Store',
  isActive: true,
  timezone: 'Africa/Lagos',
  temporarilyClosedUntil: null,
  operatingHours: hours,
});

describe('QA backend fixes', () => {
  describe('store operating hours', () => {
    const service = new StoreAvailabilityService();

    it('keeps legacy stores without configured hours open', () => {
      expect(service.evaluate(store(), new Date('2026-11-16T22:00:00.000Z'))).toMatchObject({
        isOpen: true,
        reason: 'OPEN',
      });
    });

    it('handles regular and overnight operating windows', () => {
      const regular = store([
        { dayOfWeek: 1, opensMinute: 8 * 60, closesMinute: 20 * 60, isClosed: false },
      ]);
      expect(service.evaluate(regular, new Date('2026-11-16T10:00:00.000Z')).isOpen).toBe(true);
      expect(service.evaluate(regular, new Date('2026-11-16T22:00:00.000Z'))).toMatchObject({
        isOpen: false,
        reason: 'OUTSIDE_OPERATING_HOURS',
      });

      const overnight = store([
        { dayOfWeek: 1, opensMinute: 20 * 60, closesMinute: 2 * 60, isClosed: false },
      ]);
      expect(service.evaluate(overnight, new Date('2026-11-16T22:00:00.000Z')).isOpen).toBe(true);
      expect(service.evaluate(overnight, new Date('2026-11-17T00:30:00.000Z')).isOpen).toBe(true);
    });

    it('returns the STORE_CLOSED checkout contract', async () => {
      const tx = {
        store: {
          findMany: jest
            .fn()
            .mockResolvedValue([
              store([{ dayOfWeek: 1, opensMinute: 480, closesMinute: 600, isClosed: false }]),
            ]),
        },
      };
      await service
        .assertStoresOpen(tx as never, [10], new Date('2026-11-16T20:00:00.000Z'))
        .then(() => fail('Expected the closed store to reject checkout.'))
        .catch((error: { getResponse: () => unknown }) => {
          expect(error.getResponse()).toEqual(expect.objectContaining({ code: 'STORE_CLOSED' }));
        });
    });
  });

  it('sorts marketplace prices before pagination and uses the discounted price', async () => {
    const products = [
      {
        id: 1,
        name: 'Expensive',
        brand: null,
        createdAt: new Date('2026-01-01'),
        offers: [
          {
            price: 5000,
            discountPrice: null,
            store: store(),
          },
        ],
      },
      {
        id: 2,
        name: 'Discounted',
        brand: null,
        createdAt: new Date('2026-01-02'),
        offers: [
          {
            price: 7000,
            discountPrice: 1000,
            store: store(),
          },
        ],
      },
    ];
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue(products) },
    } as unknown as PrismaService;
    const marketplace = new MarketplaceService(prisma);

    const result = await marketplace.browse({ page: 1, limit: 1, sort: 'price_asc' });

    expect(result.pagination).toMatchObject({ total: 2, page: 1, limit: 1, pages: 2 });
    expect(result.items.map((item) => item.id)).toEqual([2]);
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          offers: { some: expect.objectContaining({ store: { isActive: true } }) },
        }),
      }),
    );
  });

  it('moves a wishlist offer to the cart atomically', async () => {
    const tx = {
      wishlistItem: {
        findUnique: jest.fn().mockResolvedValue({ id: 4, userId: 8, productId: 42 }),
        delete: jest.fn().mockResolvedValue({}),
      },
      storeProduct: {
        findFirst: jest.fn().mockResolvedValue({ id: 900, productId: 42 }),
      },
    };
    const prisma = {
      $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
    } as unknown as PrismaService;
    const cart = {
      lock: jest.fn().mockResolvedValue({ id: 12 }),
      addInTransaction: jest.fn().mockResolvedValue(undefined),
      recalculate: jest.fn().mockResolvedValue({ id: 12, totalItems: 1 }),
    } as unknown as CartService;
    const marketplace = new MarketplaceService(prisma, cart);

    await expect(
      marketplace.moveWishlistToCart(8, 42, { storeProductId: 900, quantity: 1 }),
    ).resolves.toMatchObject({ moved: true, productId: 42, cart: { totalItems: 1 } });
    expect(cart.addInTransaction).toHaveBeenCalledWith(tx, 12, 900, 1);
    expect(tx.wishlistItem.delete).toHaveBeenCalledWith({ where: { id: 4 } });
  });

  it('simulates Identro verification only when the explicit mock switch is enabled', async () => {
    const values: Record<string, string> = {
      NODE_ENV: 'test',
      IDENTRO_MOCK_ENABLED: 'true',
      IDENTRO_AUTO_APPROVE_ON_MATCH: 'true',
    };
    const config = { get: (key: string) => values[key] } as ConfigService;
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = new IdentroService(config);

    await expect(service.verifyNin('12345678901')).resolves.toMatchObject({
      identroStatus: 'VERIFIED',
      identroRaw: expect.objectContaining({ success: true }),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('requires a second acknowledgement before enabling the Identro mock in production', () => {
    const values: Record<string, string> = {
      NODE_ENV: 'production',
      IDENTRO_MOCK_ENABLED: 'true',
    };
    const config = { get: (key: string) => values[key] } as ConfigService;
    expect(() => new IdentroService(config)).toThrow('IDENTRO_MOCK_ALLOW_PRODUCTION=true');
  });
});
