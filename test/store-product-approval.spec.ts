import { ForbiddenException } from '@nestjs/common';

import { StoresService } from '../src/stores/stores.service';

const productOffer = {
  productId: 42,
  price: 2500,
  stockQuantity: 10,
};

describe('Store product approval boundary', () => {
  it('blocks product uploads and updates while the store is not approved', async () => {
    const prisma = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, ownerUserId: 15, isActive: false }),
      },
      product: { findUnique: jest.fn() },
      storeProduct: { upsert: jest.fn() },
    };
    const service = new StoresService(prisma as never);

    await expect(service.addProduct(15, 6, productOffer)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.product.findUnique).not.toHaveBeenCalled();
    expect(prisma.storeProduct.upsert).not.toHaveBeenCalled();
  });

  it('allows an approved store owner to add a product offer', async () => {
    const prisma = {
      store: {
        findFirst: jest.fn().mockResolvedValue({ id: 6, ownerUserId: 15, isActive: true }),
      },
      product: { findUnique: jest.fn().mockResolvedValue({ id: 42 }) },
      storeProduct: { upsert: jest.fn().mockResolvedValue({ id: 90, storeId: 6, productId: 42 }) },
    };
    const service = new StoresService(prisma as never);

    await expect(service.addProduct(15, 6, productOffer)).resolves.toEqual(
      expect.objectContaining({ id: 90 }),
    );
    expect(prisma.storeProduct.upsert).toHaveBeenCalledTimes(1);
  });
});
