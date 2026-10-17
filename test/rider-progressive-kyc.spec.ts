import { Module, VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { RidersController } from '../src/riders/riders.controller';
import { BankResolverService } from '../src/riders/bank-resolver.service';
import { assessRiderReadiness } from '../src/riders/rider-readiness';
import { RiderWalletService } from '../src/riders/rider-wallet.service';
import { RidersService } from '../src/riders/riders.service';
import { StaffJwtGuard } from '../src/staff/staff-jwt.guard';
import { StaffPermissionGuard } from '../src/staff/staff-permission.guard';

const approved = 'APPROVED' as const;

describe('progressive rider KYC readiness', () => {
  it('accepts an uploaded driver licence image without a typed licence number', () => {
    const readiness = assessRiderReadiness({
      areaOfOperation: 'Ikeja',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+2348088888888',
      onboardingStatus: 'CREATED',
      documents: [{ type: 'NIN', documentNumber: '12345678901', status: 'PENDING' }],
      licences: [
        {
          number: null,
          documentUrl: 'https://example.test/driver-licence.jpg',
          status: 'PENDING',
        },
      ],
      liveness: [{ status: 'PENDING' }],
      vehicles: [
        {
          type: 'MOTORCYCLE',
          photoUrl: 'https://example.test/bike.jpg',
          status: 'PENDING',
          ownershipType: 'OWNED',
          documents: [{ type: 'VEHICLE_REGISTRATION', status: 'PENDING' }],
        },
      ],
      bankAccounts: [],
    });

    expect(readiness.canSubmit).toBe(true);
    expect(readiness.missingApplicationRequirements).not.toContain('DRIVER_LICENSE_DOCUMENT');
  });

  it('allows a short application while retaining operational requirements', () => {
    const readiness = assessRiderReadiness({
      areaOfOperation: 'Ikeja',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+2348088888888',
      onboardingStatus: 'CREATED',
      documents: [{ type: 'NIN', documentNumber: '12345678901', status: 'PENDING' }],
      licences: [{ number: 'AAA00000AA00', status: 'PENDING' }],
      liveness: [{ status: 'PENDING' }],
      vehicles: [
        {
          type: 'MOTORCYCLE',
          photoUrl: 'https://example.test/bike.jpg',
          status: 'PENDING',
          ownershipType: 'OWNED',
          documents: [{ type: 'VEHICLE_REGISTRATION', status: 'PENDING' }],
        },
      ],
      bankAccounts: [],
    });

    expect(readiness.canSubmit).toBe(true);
    expect(readiness.canAcceptDeliveries).toBe(false);
    expect(readiness.missingOperationalRequirements).toEqual(
      expect.arrayContaining([
        'APPROVED_IDENTITY',
        'APPROVED_LIVENESS',
        'OPERATIONALLY_APPROVED_VEHICLE',
      ]),
    );
  });

  it('requires motorized evidence but not motorized documents for a bicycle', () => {
    const base = {
      areaOfOperation: 'Ikeja',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+2348088888888',
      onboardingStatus: 'APPROVED',
      documents: [{ type: 'NIN', documentNumber: '12345678901', status: approved }],
      licences: [{ number: 'AAA00000AA00', status: approved }],
      liveness: [{ status: approved }],
      bankAccounts: [{ isPrimary: true, verificationStatus: approved }],
    };
    const motorcycle = assessRiderReadiness({
      ...base,
      vehicles: [
        {
          type: 'MOTORCYCLE',
          photoUrl: 'https://example.test/bike.jpg',
          status: approved,
          ownershipType: 'OWNED',
          documents: [{ type: 'VEHICLE_REGISTRATION', status: approved }],
        },
      ],
    });
    const bicycle = assessRiderReadiness({
      ...base,
      licences: [],
      vehicles: [
        {
          type: 'BICYCLE',
          photoUrl: 'https://example.test/bicycle.jpg',
          status: approved,
          ownershipType: 'OWNED',
          documents: [],
        },
      ],
    });

    expect(motorcycle.canAcceptDeliveries).toBe(true);
    expect(bicycle.canAcceptDeliveries).toBe(true);
  });

  it('allows a rejected rider to become submission-ready after correcting evidence', () => {
    const readiness = assessRiderReadiness({
      areaOfOperation: 'Ikeja',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+2348088888888',
      onboardingStatus: 'REJECTED',
      documents: [],
      licences: [{ number: 'AAA00000AA00', status: approved }],
      liveness: [{ status: approved }],
      vehicles: [
        {
          type: 'MOTORCYCLE',
          photoUrl: 'https://example.test/bike-new.jpg',
          status: approved,
          ownershipType: 'OWNED',
          documents: [{ type: 'VEHICLE_REGISTRATION', status: approved }],
        },
      ],
      bankAccounts: [],
    });

    expect(readiness.canSubmit).toBe(true);
    expect(readiness.missingApplicationRequirements).toEqual([]);
  });
});

describe('manual rider driver-licence review', () => {
  function setup(licence: {
    id: number;
    number: string | null;
    documentUrl: string | null;
    provider: string | null;
    providerStatus: string | null;
  }) {
    const prisma = {
      riderLicence: {
        findUnique: jest.fn().mockResolvedValue(licence),
        update: jest.fn().mockResolvedValue({ ...licence, status: 'APPROVED' }),
      },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    return {
      prisma,
      service: new AdminService(prisma as never, {} as never),
    };
  }

  it('allows an administrator to approve a complete uploaded licence', async () => {
    const { prisma, service } = setup({
      id: 21,
      number: 'AAA00000AA00',
      documentUrl: 'https://example.test/driver-licence.jpg',
      provider: null,
      providerStatus: null,
    });

    await expect(
      service.reviewRiderLicence(21, 7, 'APPROVED', 'Image and number reviewed.'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
    expect(prisma.riderLicence.update).toHaveBeenCalledWith({
      where: { id: 21 },
      data: { status: 'APPROVED' },
    });
  });

  it('allows an administrator to approve an uploaded licence without a typed number', async () => {
    const { service } = setup({
      id: 22,
      number: null,
      documentUrl: 'https://example.test/driver-licence.jpg',
      provider: null,
      providerStatus: null,
    });

    await expect(
      service.reviewRiderLicence(22, 7, 'APPROVED', 'Licence image reviewed.'),
    ).resolves.toMatchObject({ status: 'APPROVED' });
  });

  it('refuses manual approval when the licence image is missing', async () => {
    const { service } = setup({
      id: 21,
      number: 'AAA00000AA00',
      documentUrl: null,
      provider: null,
      providerStatus: null,
    });

    await expect(service.reviewRiderLicence(21, 7, 'APPROVED')).rejects.toThrow(
      'without an uploaded image',
    );
  });

  it('does not let an administrator override a failed provider-backed licence', async () => {
    const { service } = setup({
      id: 21,
      number: 'AAA00000AA00',
      documentUrl: 'https://example.test/driver-licence.jpg',
      provider: 'identro',
      providerStatus: 'FAILED',
    });

    await expect(service.reviewRiderLicence(21, 7, 'APPROVED')).rejects.toThrow(
      'cannot be manually approved',
    );
  });

  it('approves a pending manual licence image with the final rider decision', async () => {
    const initial = {
      id: 50,
      userId: 1001,
      areaOfOperation: 'Ikeja',
      emergencyContactName: 'Jane Doe',
      emergencyContactPhone: '+2348088888888',
      onboardingStatus: 'UNDER_REVIEW',
      documents: [{ type: 'NIN', documentNumber: '12345678901', status: approved }],
      licences: [
        {
          id: 21,
          number: null,
          documentUrl: 'https://example.test/driver-licence.jpg',
          provider: null,
          status: 'PENDING',
        },
      ],
      liveness: [{ status: approved }],
      vehicles: [
        {
          id: 20,
          type: 'MOTORCYCLE',
          photoUrl: 'https://example.test/bike.jpg',
          status: approved,
          ownershipType: 'OWNED',
          documents: [{ id: 22, type: 'VEHICLE_REGISTRATION', status: approved }],
        },
      ],
      bankAccounts: [],
    };
    const ready = {
      ...initial,
      licences: initial.licences.map((licence) => ({ ...licence, status: approved })),
    };
    const tx = {
      riderProfile: {
        findUnique: jest.fn().mockResolvedValueOnce(initial).mockResolvedValueOnce(ready),
        findUniqueOrThrow: jest.fn().mockResolvedValue(ready),
        update: jest.fn().mockResolvedValue({
          id: initial.id,
          userId: initial.userId,
          onboardingStatus: approved,
        }),
      },
      riderLicence: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      vehicle: { updateMany: jest.fn() },
      vehicleDocument: { updateMany: jest.fn() },
      role: { findUnique: jest.fn().mockResolvedValue(null) },
      userRole: { upsert: jest.fn() },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const notifications = { notifyUser: jest.fn().mockResolvedValue({}) };
    const service = new AdminService(prisma as never, notifications as never);

    await expect(
      service.decideRiderApplication(
        initial.id,
        7,
        'APPROVE',
        'Licence and vehicle evidence reviewed.',
        true,
      ),
    ).resolves.toMatchObject({ onboardingStatus: approved });
    expect(tx.riderLicence.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [21] } },
      data: { status: approved },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entity: 'RiderLicence',
        entityId: '21',
        action: 'KYC_APPROVED',
      }),
    });
  });
});

@Module({
  controllers: [RidersController, AdminController],
  providers: [RidersService, BankResolverService, RiderWalletService, AdminService].map(
    (provider) => ({ provide: provider, useValue: {} }),
  ),
})
class RiderDocsFixtureModule {}

describe('progressive rider KYC OpenAPI contract', () => {
  it('publishes rider upload and staff review routes used by Swagger and Scalar', async () => {
    const fixture = await Test.createTestingModule({ imports: [RiderDocsFixtureModule] })
      .overrideGuard(StaffJwtGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(StaffPermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    const app = fixture.createNestApplication();
    app.setGlobalPrefix('purse');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    try {
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().build());
      expect(document.paths).toHaveProperty('/purse/v1/riders/onboarding/requirements');
      expect(document.paths).toHaveProperty('/purse/v1/riders/licences');
      expect(document.paths['/purse/v1/riders/licences']?.post?.deprecated).not.toBe(true);
      expect(document.paths['/purse/v1/riders/licences']?.post?.summary).toContain(
        'driver licence image',
      );
      const licenceSchema = document.components?.schemas?.CreateRiderLicenceDto as
        { required?: string[] } | undefined;
      expect(licenceSchema?.required).toContain('documentUrl');
      expect(licenceSchema?.required).not.toContain('number');
      expect(document.paths).toHaveProperty('/purse/v1/riders/driver-license/verify');
      expect(document.paths).toHaveProperty('/purse/v1/riders/driver-license/requests');
      expect(document.paths).toHaveProperty('/purse/v1/riders/driver-license/requests/{reference}');
      expect(document.paths).toHaveProperty('/purse/v1/riders/kyc/session/{reference}/credentials');
      expect(document.paths).toHaveProperty('/purse/v1/riders/kyc/session/{reference}/complete');
      expect(document.paths).toHaveProperty('/purse/v1/riders/vehicles/{vehicleId}/documents');
      expect(document.paths).toHaveProperty('/purse/v1/riders/vehicles/{vehicleId}');
      expect(document.paths).toHaveProperty(
        '/purse/v1/riders/vehicles/{vehicleId}/documents/{documentId}',
      );
      expect(document.paths).toHaveProperty('/purse/v1/riders/guarantors/{guarantorId}/documents');
      expect(document.paths).toHaveProperty('/purse/v1/admin/rider-licences/{id}/review');
      expect(document.paths).toHaveProperty('/purse/v1/admin/vehicle-documents/{id}/review');
      expect(document.paths).not.toHaveProperty('/purse/v1/admin/rider-liveness/{id}/review');
      expect(document.paths).toHaveProperty('/purse/v1/admin/vehicles/{id}/review');
      expect(document.paths).toHaveProperty('/purse/v1/admin/riders/{id}/decision');
    } finally {
      await app.close();
    }
  });
});
