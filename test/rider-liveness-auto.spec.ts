import { RidersService } from '../src/riders/riders.service';

describe('automatic rider liveness decision', () => {
  const baseRecord = {
    id: 23,
    riderId: 50,
    userId: 1001,
    provider: 'identro',
    reference: 'LIVE-ABC123',
    selfieUrl: null,
    confidenceScore: null,
    status: 'PENDING',
    verifiedAt: null,
    createdAt: new Date(),
  };

  function setup(passed: boolean) {
    const prisma = {
      riderLivenessVerification: {
        findFirst: jest.fn().mockResolvedValue(baseRecord),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            ...baseRecord,
            ...data,
            confidenceScore: data.confidenceScore,
          }),
        ),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const identro = {
      completeLivenessSession: jest.fn().mockResolvedValue({
        reference: 'LIVE-ABC123',
        providerStatus: 'COMPLETED',
        passed,
        score: passed ? 91.24 : 32.5,
        threshold: 80,
        decision: passed ? 'PASSED' : 'FAILED',
        raw: {},
      }),
    };
    const service = new RidersService(prisma as never, {} as never, {} as never, identro as never);
    return { service, prisma, identro };
  }

  it('automatically approves a provider-passed liveness result', async () => {
    const { service, prisma, identro } = setup(true);

    const payload = {
      submittedFaceBase64: 'data:image/jpeg;base64,captured-face',
      mobilePassiveFallback: true,
      metadata: { captureMode: 'passive' },
    };

    const result = await service.completeLivenessSession(1001, 'LIVE-ABC123', payload);

    expect(result).toMatchObject({ status: 'APPROVED', passed: true, score: 91.24 });
    expect(prisma.riderLivenessVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 23 },
        data: expect.objectContaining({ status: 'APPROVED', confidenceScore: 91.24 }),
      }),
    );
    expect(identro.completeLivenessSession).toHaveBeenCalledWith('LIVE-ABC123', payload);
  });

  it('automatically rejects a provider-failed liveness result', async () => {
    const { service, prisma } = setup(false);

    const result = await service.completeLivenessSession(1001, 'LIVE-ABC123', {});

    expect(result).toMatchObject({ status: 'REJECTED', passed: false, score: 32.5 });
    expect(prisma.riderLivenessVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'REJECTED' }) }),
    );
  });
});
