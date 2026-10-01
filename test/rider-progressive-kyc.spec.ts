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
      expect(document.paths).toHaveProperty('/purse/v1/riders/driver-license/verify');
      expect(document.paths).toHaveProperty('/purse/v1/riders/driver-license/requests');
      expect(document.paths).toHaveProperty('/purse/v1/riders/driver-license/requests/{reference}');
      expect(document.paths).toHaveProperty('/purse/v1/riders/vehicles/{vehicleId}/documents');
      expect(document.paths).toHaveProperty('/purse/v1/riders/vehicles/{vehicleId}');
      expect(document.paths).toHaveProperty(
        '/purse/v1/riders/vehicles/{vehicleId}/documents/{documentId}',
      );
      expect(document.paths).toHaveProperty('/purse/v1/riders/guarantors/{guarantorId}/documents');
      expect(document.paths).toHaveProperty('/purse/v1/admin/rider-licences/{id}/review');
      expect(document.paths).toHaveProperty('/purse/v1/admin/vehicle-documents/{id}/review');
      expect(document.paths).toHaveProperty('/purse/v1/admin/rider-liveness/{id}/review');
      expect(document.paths).toHaveProperty('/purse/v1/admin/vehicles/{id}/review');
      expect(document.paths).toHaveProperty('/purse/v1/admin/riders/{id}/decision');
    } finally {
      await app.close();
    }
  });
});
