import { BadRequestException } from '@nestjs/common';

import { RidersService } from '../src/riders/riders.service';

describe('rider live job location', () => {
  it('stores the latest server-timestamped GPS point for an approved rider', async () => {
    const prisma = {
      riderProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2,
          onboardingStatus: 'APPROVED',
          user: { status: 'ACTIVE' },
        }),
        update: jest.fn().mockResolvedValue({
          currentLatitude: 6.6018,
          currentLongitude: 3.3515,
          locationAccuracyM: 12.5,
          locationUpdatedAt: new Date(),
          isOnline: false,
        }),
      },
    };
    const service = new RidersService(prisma as never, {} as never, {} as never, {} as never);

    const result = await service.updateCurrentLocation(15, {
      latitude: 6.6018,
      longitude: 3.3515,
      accuracyM: 12.5,
    });

    expect(prisma.riderProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 15 },
        data: expect.objectContaining({
          currentLatitude: 6.6018,
          currentLongitude: 3.3515,
          locationAccuracyM: 12.5,
          locationUpdatedAt: expect.any(Date),
        }),
      }),
    );
    expect(result).toEqual(
      expect.objectContaining({ latitude: 6.6018, longitude: 3.3515, accuracyM: 12.5 }),
    );
  });

  it('does not accept job-location updates from an unapproved rider', async () => {
    const prisma = {
      riderProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 2,
          onboardingStatus: 'UNDER_REVIEW',
          user: { status: 'ACTIVE' },
        }),
      },
    };
    const service = new RidersService(prisma as never, {} as never, {} as never, {} as never);

    await expect(
      service.updateCurrentLocation(15, { latitude: 6.6018, longitude: 3.3515 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
