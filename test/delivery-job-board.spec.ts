import { ConflictException, ForbiddenException } from '@nestjs/common';

import { DeliveryService } from '../src/delivery/delivery.service';

const eligibleRider = {
  id: 2,
  userId: 15,
  areaOfOperation: 'Ikeja',
  businessCity: 'Ikeja',
  businessState: 'Lagos',
  emergencyContactName: 'Emergency Contact',
  emergencyContactPhone: '+2348000000000',
  onboardingStatus: 'APPROVED',
  isOnline: true,
  currentLatitude: 6.6018,
  currentLongitude: 3.3515,
  locationAccuracyM: 12.5,
  locationUpdatedAt: new Date(),
  user: { status: 'ACTIVE' },
  documents: [{ type: 'NIN', documentNumber: '12345678901', status: 'APPROVED' }],
  licences: [{ number: null, documentUrl: 'https://example.com/licence.jpg', status: 'APPROVED' }],
  liveness: [{ status: 'APPROVED' }],
  vehicles: [
    {
      type: 'MOTORCYCLE',
      photoUrl: 'https://example.com/motorcycle.jpg',
      status: 'APPROVED',
      ownershipType: 'OWNED',
      documents: [{ type: 'VEHICLE_REGISTRATION', status: 'APPROVED' }],
    },
  ],
  bankAccounts: [],
};

const availableDelivery = {
  id: 33,
  orderId: 501,
  riderId: null,
  status: 'PENDING',
  deliveryCity: 'Ikeja',
  deliveryState: 'Lagos',
  createdAt: new Date('2026-10-07T10:00:00.000Z'),
  order: {
    id: 501,
    userId: 99,
    orderNumber: 'PUR-261007-ABCDEFGH',
    currentStatus: 'READY_FOR_PICKUP',
    shippingFee: 2500,
    currency: 'NGN',
    store: {
      id: 8,
      storeName: 'Ikeja Superstore',
      address: '1 Allen Avenue',
      city: 'Ikeja',
      state: 'Lagos',
      latitude: 6.6018,
      longitude: 3.3515,
    },
    _count: { items: 3 },
  },
};

describe('rider delivery job board', () => {
  it('pushes a new job notification only to an eligible nearby online rider', async () => {
    const prisma = {
      delivery: { findUnique: jest.fn().mockResolvedValue(availableDelivery) },
      riderProfile: { findMany: jest.fn().mockResolvedValue([eligibleRider]) },
    };
    const notifications = { notifyUser: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = new DeliveryService(
      prisma as never,
      notifications as never,
      {} as never,
      {} as never,
    );

    await expect(service.notifyAvailableRidersForOrder(501)).resolves.toEqual({
      matched: 1,
      notified: 1,
    });
    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 15,
        type: 'DELIVERY_AVAILABLE',
        eventKey: 'delivery-available:33:15',
      }),
    );
  });

  it('returns only paginated service-area jobs and defaults to 15', async () => {
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(eligibleRider) },
      delivery: {
        findMany: jest.fn().mockResolvedValue([availableDelivery]),
      },
    };
    const service = new DeliveryService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.available(15);

    expect(prisma.delivery.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: 'asc' } }),
    );
    expect(result.meta).toEqual(
      expect.objectContaining({ page: 1, limit: 15, total: 1, totalPages: 1, radiusKm: 10 }),
    );
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 33,
        orderId: 501,
        itemCount: 3,
        distanceKm: 0,
        matchingMode: 'LIVE_GPS',
      }),
    );
    expect(result.items[0]).not.toHaveProperty('deliveryAddress');
  });

  it('requires the rider to be online before browsing jobs', async () => {
    const prisma = {
      riderProfile: {
        findUnique: jest.fn().mockResolvedValue({ ...eligibleRider, isOnline: false }),
      },
    };
    const service = new DeliveryService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.available(15)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a stale rider location before returning jobs', async () => {
    const prisma = {
      riderProfile: {
        findUnique: jest.fn().mockResolvedValue({
          ...eligibleRider,
          locationUpdatedAt: new Date(Date.now() - 10 * 60 * 1000),
        }),
      },
    };
    const service = new DeliveryService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.available(15)).rejects.toThrow('GPS location is stale');
  });

  it('filters out stores beyond the configured live-GPS radius', async () => {
    const farDelivery = {
      ...availableDelivery,
      order: {
        ...availableDelivery.order,
        store: {
          ...availableDelivery.order.store,
          latitude: 9.0765,
          longitude: 7.3986,
        },
      },
    };
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(eligibleRider) },
      delivery: { findMany: jest.fn().mockResolvedValue([farDelivery]) },
    };
    const service = new DeliveryService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.available(15);

    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(0);
  });

  it('uses the same broad locality matching for listing and claiming jobs', async () => {
    const ibadanRider = {
      ...eligibleRider,
      areaOfOperation: 'University of Ibadan, Ibadan North',
      currentLatitude: 7.4443,
      currentLongitude: 3.9003,
    };
    const ibadanDelivery = {
      ...availableDelivery,
      deliveryCity: 'Ibadan',
      deliveryState: 'Oyo',
      order: {
        ...availableDelivery.order,
        store: {
          ...availableDelivery.order.store,
          storeName: 'Campus Hub Ibadan',
          city: 'Ibadan',
          state: 'Oyo',
          latitude: 7.4443,
          longitude: 3.9003,
        },
      },
    };
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(ibadanRider) },
      delivery: { findMany: jest.fn().mockResolvedValue([ibadanDelivery]) },
    };
    const service = new DeliveryService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.available(15);

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({ id: 33, distanceKm: 0, matchingMode: 'LIVE_GPS' }),
    );
  });

  it('still excludes jobs outside the rider service area even when they are nearby', async () => {
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(eligibleRider) },
      delivery: {
        findMany: jest.fn().mockResolvedValue([
          {
            ...availableDelivery,
            deliveryCity: 'Surulere',
            order: {
              ...availableDelivery.order,
              store: { ...availableDelivery.order.store, city: 'Surulere' },
            },
          },
        ]),
      },
    };
    const service = new DeliveryService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.available(15);

    expect(result.items).toEqual([]);
  });

  it('atomically assigns the first eligible rider and expires other offers', async () => {
    const claimed = {
      ...availableDelivery,
      riderId: 15,
      status: 'ASSIGNED',
      order: { ...availableDelivery.order, items: [] },
    };
    const tx = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(eligibleRider) },
      delivery: {
        findUnique: jest.fn().mockResolvedValue(availableDelivery),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue(claimed),
      },
      order: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      deliveryOffer: { upsert: jest.fn(), updateMany: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const notifications = { notifyUser: jest.fn() };
    const settlements = { holdRiderEarning: jest.fn() };
    const gateway = { broadcastJobClaimed: jest.fn() };
    const service = new DeliveryService(
      prisma as never,
      notifications as never,
      gateway as never,
      settlements as never,
    );

    const result = await service.claim(15, 33);

    expect(tx.delivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 33, riderId: null }),
        data: expect.objectContaining({ riderId: 15, status: 'ASSIGNED' }),
      }),
    );
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 501, currentStatus: 'READY_FOR_PICKUP' },
      data: { currentStatus: 'RIDER_ASSIGNED' },
    });
    expect(tx.deliveryOffer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'EXPIRED' } }),
    );
    expect(settlements.holdRiderEarning).toHaveBeenCalledWith(33, tx);
    expect(notifications.notifyUser).toHaveBeenCalled();
    expect(gateway.broadcastJobClaimed).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryId: 33, orderId: 501 }),
    );
    expect(result.status).toBe('ASSIGNED');
  });

  it('returns conflict when another rider wins the claim race', async () => {
    const tx = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue(eligibleRider) },
      delivery: {
        findUnique: jest.fn().mockResolvedValue(availableDelivery),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new DeliveryService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.claim(15, 33)).rejects.toBeInstanceOf(ConflictException);
  });
});
