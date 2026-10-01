import { AdminService } from '../src/admin/admin.service';
import { templates } from '../src/mail/templates';

describe('rider application decision notifications', () => {
  it('renders dedicated approval and rejection emails', () => {
    const approval = templates.riderApplicationDecision({
      appName: 'Purse',
      firstName: 'Ada',
      status: 'APPROVED',
    });
    const rejection = templates.riderApplicationDecision({
      appName: 'Purse',
      firstName: 'Ada',
      status: 'REJECTED',
      reason: 'Registration image is unreadable.',
    });

    expect(approval.subject).toContain('approved');
    expect(approval.text).toContain('start accepting delivery requests');
    expect(rejection.text).toContain('Registration image is unreadable.');
    expect(rejection.html).toContain('REJECTED');
  });

  it('sends an in-app and email-backed notification after approval', async () => {
    const candidate = {
      id: 50,
      userId: 1001,
      areaOfOperation: 'Ikeja',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+2348088888888',
      onboardingStatus: 'UNDER_REVIEW',
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
    const tx = {
      riderProfile: {
        findUnique: jest.fn().mockResolvedValue(candidate),
        update: jest.fn().mockResolvedValue({
          id: candidate.id,
          userId: candidate.userId,
          onboardingStatus: 'APPROVED',
        }),
      },
      role: { findUnique: jest.fn().mockResolvedValue(null) },
      userRole: { upsert: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const notifications = { notifyUser: jest.fn().mockResolvedValue({ id: 1 }) };
    const service = new AdminService(prisma as never, notifications as never);

    await service.approveRider(candidate.id, 7, 'All checks passed.');

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: candidate.userId,
        type: 'KYC_UPDATE',
        title: 'Rider application approved',
        templateKey: 'riderApplicationDecision',
        templateData: { status: 'APPROVED', reason: 'All checks passed.' },
      }),
    );
  });

  it('includes the rejection reason in both notification channels', async () => {
    const tx = {
      riderProfile: {
        findUnique: jest.fn().mockResolvedValue({
          id: 50,
          userId: 1001,
          onboardingStatus: 'UNDER_REVIEW',
          documents: [],
          licences: [],
          liveness: [],
          vehicles: [],
        }),
        update: jest.fn().mockResolvedValue({ id: 50, userId: 1001, onboardingStatus: 'REJECTED' }),
      },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const notifications = { notifyUser: jest.fn().mockResolvedValue({ id: 2 }) };
    const service = new AdminService(prisma as never, notifications as never);

    await service.rejectRider(50, 7, 'Registration image is unreadable.');

    expect(notifications.notifyUser).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 1001,
        message: expect.stringContaining('Registration image is unreadable.'),
        templateKey: 'riderApplicationDecision',
        templateData: {
          status: 'REJECTED',
          reason: 'Registration image is unreadable.',
        },
      }),
    );
  });
});
