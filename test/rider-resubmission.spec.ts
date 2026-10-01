import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { RidersService } from '../src/riders/riders.service';

const correctedRider = {
  id: 50,
  userId: 1001,
  areaOfOperation: 'Ikeja',
  emergencyContactName: 'Jane Doe',
  emergencyContactPhone: '+2348088888',
  onboardingStatus: 'REJECTED',
  documents: [],
  licences: [{ number: 'AAA00000AA00', status: 'APPROVED' }],
  liveness: [{ status: 'APPROVED' }],
  vehicles: [
    {
      type: 'MOTORCYCLE',
      photoUrl: 'https://example.test/bike.jpg',
      status: 'APPROVED',
      ownershipType: 'OWNED',
      documents: [{ type: 'VEHICLE_REGISTRATION', status: 'APPROVED' }],
    },
  ],
  bankAccounts: [],
};

describe('rider KYC resubmission', () => {
  it('clears the rejection snapshot and increments the attempt', async () => {
    const prisma = {
      riderProfile: {
        findUnique: jest.fn().mockResolvedValue(correctedRider),
        update: jest.fn().mockResolvedValue({
          ...correctedRider,
          onboardingStatus: 'UNDER_REVIEW',
          rejectionReason: null,
          submissionAttempt: 2,
        }),
      },
    };
    const notifications = { notifyUser: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = new RidersService(
      prisma as never,
      notifications as never,
      {} as never,
      {} as never,
    );

    await service.submitForReview(correctedRider.userId);

    expect(prisma.riderProfile.update).toHaveBeenCalledWith({
      where: { id: correctedRider.id },
      data: {
        onboardingStatus: 'UNDER_REVIEW',
        rejectionReason: null,
        rejectedAt: null,
        rejectedEvidence: Prisma.DbNull,
        submissionAttempt: { increment: 1 },
      },
    });
    expect(notifications.notifyUser).toHaveBeenCalled();
  });

  it.each(['UNDER_REVIEW', 'APPROVED', 'SUSPENDED'])(
    'blocks resubmission from %s',
    async (onboardingStatus) => {
      const prisma = {
        riderProfile: {
          findUnique: jest.fn().mockResolvedValue({ ...correctedRider, onboardingStatus }),
        },
      };
      const service = new RidersService(prisma as never, {} as never, {} as never, {} as never);

      await expect(service.submitForReview(correctedRider.userId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    },
  );
});
