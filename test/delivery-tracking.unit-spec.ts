import { Test } from '@nestjs/testing';
import { DeliveryTrackingService } from '../src/delivery/delivery-tracking.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { RedisService } from '../src/redis/redis.service';
import { ConfigService } from '@nestjs/config';
import { DeliveryStatus } from '@prisma/client';

describe('DeliveryTrackingService', () => {
  let service: DeliveryTrackingService;
  const prisma = {
    delivery: { findUnique: jest.fn() },
    deliveryLocation: { create: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
  };
  const redis = { client: { set: jest.fn() } };
  const config = { get: jest.fn((_key: string, fallback: string) => fallback) };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DeliveryTrackingService,
        { provide: PrismaService, useValue: prisma },
        { provide: RedisService, useValue: redis },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(DeliveryTrackingService);
  });

  it('rejects updates for riders not assigned to the delivery', async () => {
    prisma.delivery.findUnique.mockResolvedValue({ id: 10, riderId: 99, status: DeliveryStatus.IN_TRANSIT });
    await expect(
      service.recordLocation(7, 10, { latitude: 6.5, longitude: 3.3 }),
    ).rejects.toThrow('You are not assigned to this delivery.');
  });

  it('accepts an active location update and stores the GPS point', async () => {
    prisma.delivery.findUnique.mockResolvedValue({ id: 10, riderId: 7, status: DeliveryStatus.IN_TRANSIT });
    redis.client.set.mockResolvedValue('OK');
    prisma.deliveryLocation.create.mockResolvedValue({
      id: 1,
      deliveryId: 10,
      riderId: 7,
      latitude: 6.5,
      longitude: 3.3,
      accuracyM: null,
      speedKph: null,
      headingDeg: null,
      batteryLevel: null,
      recordedAt: new Date(),
    });

    const result = await service.recordLocation(7, 10, {
      latitude: 6.5,
      longitude: 3.3,
    });

    expect(prisma.deliveryLocation.create).toHaveBeenCalled();
    expect(result.deliveryId).toBe(10);
  });

  it('rate limits excessive location updates', async () => {
    prisma.delivery.findUnique.mockResolvedValue({ id: 10, riderId: 7, status: DeliveryStatus.IN_TRANSIT });
    redis.client.set.mockResolvedValue(null);

    await expect(
      service.recordLocation(7, 10, { latitude: 6.5, longitude: 3.3 }),
    ).rejects.toThrow('Location update rate exceeded.');
  });
});
