import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BankResolverService } from './bank-resolver.service';
import {
  CompleteLivenessSessionDto,
  CreateBankAccountDto,
  CreateGuarantorDocumentDto,
  CreateGuarantorDto,
  CreateRiderLicenceDto,
  CreateRiderDocumentDto,
  CreateVehicleDocumentDto,
  CreateVehicleDto,
  MintKycSessionDto,
  UpdateRiderProfileDto,
  UpdateRiderSettingsDto,
  UpdateVehicleDto,
  ReplaceVehicleDocumentDto,
  VerifyGuarantorDocumentDto,
  VerifyDriverLicenseDto,
  VerifyRiderDocumentDto,
} from './dto/rider.dto';
import { IdentroService } from '../identro/identro.service';
import { assessRiderReadiness } from './rider-readiness';

@Injectable()
export class RidersService {
  private readonly logger = new Logger(RidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly banks: BankResolverService,
    private readonly identro: IdentroService,
  ) {}

  getOnboardingRequirements() {
    return {
      strategy: 'PROGRESSIVE_KYC',
      stages: [
        {
          key: 'APPLICATION',
          label: 'Quick application',
          description: 'Required before submitting the rider application.',
          requirements: [
            { key: 'areaOfOperation', label: 'Service area', required: true },
            {
              key: 'identity',
              label: 'Government identity number (a verified driver licence also qualifies)',
              required: true,
            },
            { key: 'liveness', label: 'Start liveness-only verification', required: true },
            {
              key: 'driverLicence',
              label: 'Upload a clear driver licence image',
              required: true,
            },
            { key: 'motorcycle', label: 'Motorcycle, plate, and photograph', required: true },
            {
              key: 'vehicleRegistration',
              label: 'Motorcycle registration document',
              required: true,
            },
            { key: 'emergencyContact', label: 'Emergency contact', required: true },
          ],
        },
        {
          key: 'OPERATIONAL_APPROVAL',
          label: 'Operational verification',
          description: 'Required before a motorized rider can accept live deliveries.',
          requirements: [
            { key: 'approvedIdentity', label: 'Approved identity', required: true },
            { key: 'approvedLiveness', label: 'Approved liveness', required: true },
            {
              key: 'riderLicence',
              label: 'Admin-approved driver licence image',
              required: true,
            },
            {
              key: 'vehicleRegistration',
              label: 'Vehicle registration',
              required: 'MOTORIZED_VEHICLES_ONLY',
            },
            {
              key: 'motorcyclePhoto',
              label: 'Admin-approved motorcycle photo and plate',
              required: true,
            },
          ],
        },
        {
          key: 'CONDITIONAL_REVIEW',
          label: 'Risk-based checks',
          description: 'Requested only when compliance determines they are necessary.',
          requirements: [
            {
              key: 'ownershipPermission',
              label: 'Proof of ownership or permission to use',
              required: false,
            },
            { key: 'guarantor', label: 'Guarantor and guarantor ID', required: false },
            { key: 'insurance', label: 'Insurance', required: false },
            { key: 'roadworthiness', label: 'Roadworthiness certificate', required: false },
          ],
        },
      ],
    };
  }

  async getProfile(userId: number) {
    const profile = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        documents: true,
        licences: true,
        liveness: true,
        vehicles: { include: { documents: true, verifications: true } },
        bankAccounts: true,
        financialVerifications: true,
        guarantors: { include: { documents: true } },
      },
    });

    if (!profile) {
      return null;
    }

    const readiness = assessRiderReadiness(profile);

    return {
      ...profile,
      statusMessage:
        profile.onboardingStatus === 'UNDER_REVIEW' ? 'Your Account is Under Review' : undefined,
      ...readiness,
    };
  }

  inbox(userId: number, page = 1, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    return this.notifications.list(userId, { page, limit });
  }

  async settings(userId: number) {
    const [profile, notificationPreferences] = await Promise.all([
      this.getProfile(userId),
      this.notifications.preferences(userId),
    ]);
    return { profile, notificationPreferences };
  }

  async updateSettings(userId: number, dto: UpdateRiderSettingsDto) {
    const { notificationPreferences, ...profile } = dto;
    if (Object.keys(profile).length) await this.updateProfile(userId, profile);
    if (notificationPreferences?.length) {
      await Promise.all(
        notificationPreferences.map((preference) =>
          this.notifications.updatePreference(userId, preference),
        ),
      );
    }
    return this.settings(userId);
  }

  async updateAvailability(userId: number, isOnline: boolean) {
    const profile = await this.getProfile(userId);
    if (!profile) throw new NotFoundException('Rider profile was not found.');

    if (isOnline && !profile.canAcceptDeliveries) {
      throw new BadRequestException({
        message: 'Complete operational approval before going online.',
        missingOperationalRequirements: profile.missingOperationalRequirements,
      });
    }
    if (isOnline) this.ensureFreshJobLocation(profile);

    const updated = await this.prisma.riderProfile.update({
      where: { userId },
      data: { isOnline },
      select: { id: true, userId: true, onboardingStatus: true, isOnline: true },
    });

    return {
      ...updated,
      canBrowseAvailableDeliveries: updated.onboardingStatus === 'APPROVED' && updated.isOnline,
    };
  }

  async updateCurrentLocation(
    userId: number,
    input: { latitude: number; longitude: number; accuracyM?: number },
  ) {
    const profile = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: { user: { select: { status: true } } },
    });
    if (!profile) throw new NotFoundException('Rider profile was not found.');
    if (profile.onboardingStatus !== 'APPROVED' || profile.user.status !== 'ACTIVE') {
      throw new BadRequestException('Only an approved, active rider can publish a job location.');
    }

    const locationUpdatedAt = new Date();
    const updated = await this.prisma.riderProfile.update({
      where: { userId },
      data: {
        currentLatitude: input.latitude,
        currentLongitude: input.longitude,
        locationAccuracyM: input.accuracyM ?? null,
        locationUpdatedAt,
      },
      select: {
        currentLatitude: true,
        currentLongitude: true,
        locationAccuracyM: true,
        locationUpdatedAt: true,
        isOnline: true,
      },
    });

    return {
      latitude: Number(updated.currentLatitude),
      longitude: Number(updated.currentLongitude),
      accuracyM: updated.locationAccuracyM == null ? null : Number(updated.locationAccuracyM),
      locationUpdatedAt: updated.locationUpdatedAt,
      isOnline: updated.isOnline,
    };
  }

  private ensureFreshJobLocation(profile: {
    currentLatitude: Prisma.Decimal | null;
    currentLongitude: Prisma.Decimal | null;
    locationAccuracyM: Prisma.Decimal | null;
    locationUpdatedAt: Date | null;
  }) {
    if (
      profile.currentLatitude == null ||
      profile.currentLongitude == null ||
      !profile.locationUpdatedAt
    ) {
      throw new BadRequestException('Publish your current GPS location before going online.');
    }
    const configuredAge = Number(process.env.RIDER_LOCATION_MAX_AGE_SECONDS);
    const maxAgeMs =
      (Number.isFinite(configuredAge) && configuredAge > 0 ? configuredAge : 120) * 1000;
    if (Date.now() - profile.locationUpdatedAt.getTime() > maxAgeMs) {
      throw new BadRequestException('Your GPS location is stale. Update it before going online.');
    }
    const configuredAccuracy = Number(process.env.RIDER_LOCATION_MAX_ACCURACY_M);
    const maximumAccuracy =
      Number.isFinite(configuredAccuracy) && configuredAccuracy > 0 ? configuredAccuracy : 500;
    if (profile.locationAccuracyM != null && Number(profile.locationAccuracyM) > maximumAccuracy) {
      throw new BadRequestException('GPS accuracy is too low. Acquire a better location fix.');
    }
  }

  async updateProfile(userId: number, dto: UpdateRiderProfileDto) {
    return this.prisma.riderProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...dto,
      },
      update: dto,
    });
  }

  async addDocument(userId: number, dto: CreateRiderDocumentDto) {
    const rider = await this.requireProfile(userId);

    return this.prisma.riderDocument.create({
      data: {
        riderId: rider.id,
        type: dto.type,
        documentNumber: dto.documentNumber,
        url: dto.url,
        publicId: dto.publicId,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        uploadedById: userId,
      },
    });
  }

  async addVehicle(userId: number, dto: CreateVehicleDto) {
    const rider = await this.requireProfile(userId);

    return this.prisma.vehicle.create({
      data: {
        riderId: rider.id,
        type: dto.type,
        make: dto.make,
        model: dto.model,
        year: dto.year,
        color: dto.color,
        plateNumber: dto.plateNumber.trim().toUpperCase(),
        registrationNumber: dto.registrationNumber,
        ownershipType: dto.ownershipType,
        photoUrl: dto.photoUrl,
      },
    });
  }

  async updateVehicle(userId: number, vehicleId: number, dto: UpdateVehicleDto) {
    const rider = await this.requireProfile(userId);
    this.ensureApplicationEditable(rider.onboardingStatus);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, riderId: rider.id },
    });
    if (!vehicle) throw new NotFoundException('Motorcycle not found or does not belong to rider.');
    if (!['PENDING', 'REJECTED'].includes(vehicle.status)) {
      throw new BadRequestException('Only pending or rejected motorcycle evidence can be edited.');
    }
    return this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: {
        ...dto,
        ...(dto.plateNumber && { plateNumber: dto.plateNumber.trim().toUpperCase() }),
        status: 'PENDING',
      },
    });
  }

  async addLicence(userId: number, dto: CreateRiderLicenceDto) {
    const rider = await this.requireProfile(userId);
    return this.prisma.riderLicence.create({
      data: {
        riderId: rider.id,
        type: dto.type,
        number: dto.number?.trim().toUpperCase(),
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        documentUrl: dto.documentUrl.trim(),
      },
    });
  }

  async verifyDriverLicense(userId: number, dto: VerifyDriverLicenseDto, trackedRequest = false) {
    const rider = await this.requireProfile(userId);
    const existing = await this.prisma.riderLicence.findUnique({
      where: {
        riderId_idempotencyKey: { riderId: rider.id, idempotencyKey: dto.idempotencyKey },
      },
    });
    if (existing) return this.safeLicence(existing);

    const result = trackedRequest
      ? await this.identro.createDriverLicenseRequest(
          dto.licenseNumber.trim().toUpperCase(),
          dto.idempotencyKey,
        )
      : await this.identro.verifyDriversLicense(dto.licenseNumber.trim().toUpperCase(), {
          idempotencyKey: dto.idempotencyKey,
          consentCaptured: dto.consentCaptured,
        });

    const providerStatus = result.identroStatus ?? 'PENDING';
    const status =
      providerStatus === 'VERIFIED'
        ? ('APPROVED' as const)
        : ['FAILED', 'NOT_FOUND', 'REJECTED'].includes(providerStatus)
          ? ('REJECTED' as const)
          : ('PENDING' as const);
    const licence = await this.prisma.riderLicence.create({
      data: {
        riderId: rider.id,
        type: 'DRIVERS_LICENSE',
        number: dto.licenseNumber.trim().toUpperCase(),
        status,
        provider: 'identro',
        providerReference: result.identroReference,
        providerStatus,
        providerRaw: result.identroRaw as object,
        idempotencyKey: dto.idempotencyKey,
        consentCapturedAt: new Date(),
        verifiedAt: status === 'APPROVED' ? new Date() : null,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'RIDER_LICENSE_PROVIDER_VERIFICATION',
        entity: 'RiderLicence',
        entityId: String(licence.id),
        changes: { provider: 'identro', providerStatus, status },
      },
    });
    return this.safeLicence(licence);
  }

  async listDriverLicenseRequests(userId: number, page = 1, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    const rider = await this.requireProfile(userId);
    const skip = (page - 1) * limit;
    const where = { riderId: rider.id, provider: 'identro' };
    const [records, total] = await Promise.all([
      this.prisma.riderLicence.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.riderLicence.count({ where }),
    ]);
    return { items: records.map((record) => this.safeLicence(record)), total, page, limit };
  }

  async syncDriverLicenseRequest(userId: number, reference: string) {
    const rider = await this.requireProfile(userId);
    const licence = await this.prisma.riderLicence.findFirst({
      where: { riderId: rider.id, providerReference: reference },
    });
    if (!licence) throw new NotFoundException('Driver licence request not found.');
    const result = await this.identro.getDriverLicenseRequest(reference);
    const providerStatus = result.identroStatus ?? 'PENDING';
    const status =
      providerStatus === 'VERIFIED'
        ? ('APPROVED' as const)
        : ['FAILED', 'NOT_FOUND', 'REJECTED'].includes(providerStatus)
          ? ('REJECTED' as const)
          : ('PENDING' as const);
    const updated = await this.prisma.riderLicence.update({
      where: { id: licence.id },
      data: {
        providerStatus,
        providerRaw: result.identroRaw as object,
        status,
        verifiedAt: status === 'APPROVED' ? new Date() : null,
      },
    });
    return this.safeLicence(updated);
  }

  async addVehicleDocument(userId: number, vehicleId: number, dto: CreateVehicleDocumentDto) {
    const rider = await this.requireProfile(userId);
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id: vehicleId, riderId: rider.id },
    });
    if (!vehicle)
      throw new NotFoundException('Vehicle not found or does not belong to this rider.');
    return this.prisma.vehicleDocument.create({
      data: {
        vehicleId,
        type: dto.type,
        documentNumber: dto.documentNumber,
        url: dto.url,
        publicId: dto.publicId,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      },
    });
  }

  async replaceVehicleDocument(
    userId: number,
    vehicleId: number,
    documentId: number,
    dto: ReplaceVehicleDocumentDto,
  ) {
    const rider = await this.requireProfile(userId);
    this.ensureApplicationEditable(rider.onboardingStatus);
    const document = await this.prisma.vehicleDocument.findFirst({
      where: { id: documentId, vehicleId, vehicle: { riderId: rider.id } },
    });
    if (!document) {
      throw new NotFoundException('Motorcycle document not found or does not belong to rider.');
    }
    if (document.status !== 'REJECTED') {
      throw new BadRequestException('Only a rejected motorcycle document can be replaced.');
    }
    return this.prisma.vehicleDocument.update({
      where: { id: documentId },
      data: {
        documentNumber: dto.documentNumber,
        url: dto.url,
        publicId: dto.publicId,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
        status: 'PENDING',
        rejectionReason: null,
        reviewedById: null,
        reviewedAt: null,
      },
    });
  }

  async addBankAccount(userId: number, dto: CreateBankAccountDto) {
    const rider = await this.requireProfile(userId);
    const resolved = await this.banks.resolveAccount(dto.bankCode, dto.accountNumber);

    return this.prisma.$transaction(async (tx) => {
      const existingAccounts = await tx.riderBankAccount.count({ where: { riderId: rider.id } });
      const isPrimary = dto.isPrimary === true || existingAccounts === 0;
      if (isPrimary) {
        await tx.riderBankAccount.updateMany({
          where: { riderId: rider.id },
          data: { isPrimary: false },
        });
      }

      return tx.riderBankAccount.create({
        data: {
          riderId: rider.id,
          bankCode: dto.bankCode,
          bankName: resolved.bankName,
          accountNumber: resolved.account_number,
          accountName: resolved.account_name,
          verificationStatus: 'APPROVED',
          isPrimary,
        },
      });
    });
  }

  async setPrimaryBankAccount(userId: number, accountId: number) {
    const rider = await this.requireProfile(userId);
    return this.prisma.$transaction(async (tx) => {
      const account = await tx.riderBankAccount.findFirst({
        where: { id: accountId, riderId: rider.id },
      });
      if (!account) {
        throw new NotFoundException('Bank account not found or does not belong to this rider.');
      }
      if (account.verificationStatus !== 'APPROVED') {
        throw new BadRequestException('Only a verified bank account can be set as primary.');
      }
      await tx.riderBankAccount.updateMany({
        where: { riderId: rider.id, id: { not: accountId } },
        data: { isPrimary: false },
      });
      return tx.riderBankAccount.update({
        where: { id: accountId },
        data: { isPrimary: true },
      });
    });
  }

  async removeBankAccount(userId: number, accountId: number) {
    const rider = await this.requireProfile(userId);
    await this.prisma.$transaction(async (tx) => {
      const account = await tx.riderBankAccount.findFirst({
        where: { id: accountId, riderId: rider.id },
      });
      if (!account) {
        throw new NotFoundException('Bank account not found or does not belong to this rider.');
      }

      await tx.riderBankAccount.delete({ where: { id: accountId } });
      if (account.isPrimary) {
        const replacement = await tx.riderBankAccount.findFirst({
          where: { riderId: rider.id, verificationStatus: 'APPROVED' },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { id: true },
        });
        if (replacement) {
          await tx.riderBankAccount.update({
            where: { id: replacement.id },
            data: { isPrimary: true },
          });
        }
      }
    });

    return { success: true, message: 'Bank account removed successfully.' };
  }

  async addGuarantor(userId: number, dto: CreateGuarantorDto) {
    const rider = await this.requireProfile(userId);

    return this.prisma.guarantor.create({
      data: {
        riderId: rider.id,
        fullName: dto.fullName,
        phone: dto.phone,
        relationship: dto.relationship,
        address: dto.address,
        photographUrl: dto.photographUrl,
      },
    });
  }

  async addGuarantorDocument(userId: number, guarantorId: number, dto: CreateGuarantorDocumentDto) {
    const rider = await this.requireProfile(userId);
    const guarantor = await this.prisma.guarantor.findFirst({
      where: { id: guarantorId, riderId: rider.id },
    });
    if (!guarantor)
      throw new NotFoundException('Guarantor not found or does not belong to this rider.');
    return this.prisma.guarantorDocument.create({
      data: {
        guarantorId,
        type: dto.type,
        documentNumber: dto.documentNumber,
        url: dto.url,
        publicId: dto.publicId,
      },
    });
  }

  async submitForReview(userId: number) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        documents: true,
        licences: true,
        liveness: true,
        vehicles: { include: { documents: true } },
        bankAccounts: true,
      },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    this.ensureApplicationEditable(rider.onboardingStatus);

    const readiness = assessRiderReadiness(rider);
    if (readiness.missingApplicationRequirements.length) {
      throw new BadRequestException({
        message: 'Complete the quick application requirements before submitting.',
        missingRequirements: readiness.missingApplicationRequirements,
      });
    }

    const updated = await this.prisma.riderProfile.update({
      where: { id: rider.id },
      data: {
        onboardingStatus: 'UNDER_REVIEW',
        rejectionReason: null,
        rejectedAt: null,
        rejectedEvidence: Prisma.DbNull,
        submissionAttempt: { increment: 1 },
      },
    });

    await this.notifications.notifyUser({
      userId,
      type: 'KYC_UPDATE',
      title: 'Rider verification submitted',
      message: 'Your rider application is now under review.',
      data: { riderId: updated.id, status: updated.onboardingStatus },
      templateKey: 'kycUpdate',
      templateData: {
        status: updated.onboardingStatus,
        message: 'Our compliance team will review your documents.',
      },
    });

    return {
      ...updated,
      statusMessage: 'Your Account is Under Review',
      canSubmit: false,
      canAcceptDeliveries: false,
      missingOperationalRequirements: readiness.missingOperationalRequirements,
    };
  }

  private async requireProfile(userId: number) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    return rider;
  }

  private ensureApplicationEditable(onboardingStatus: string) {
    if (onboardingStatus === 'UNDER_REVIEW') {
      throw new BadRequestException('This rider application is already under review.');
    }
    if (onboardingStatus === 'APPROVED') {
      throw new BadRequestException('An approved rider cannot resubmit onboarding.');
    }
    if (onboardingStatus === 'SUSPENDED') {
      throw new BadRequestException(
        'A suspended rider cannot resubmit until the suspension is removed.',
      );
    }
  }

  async mintKycSession(userId: number, dto: MintKycSessionDto) {
    const rider = await this.requireProfile(userId);

    const session = await this.identro.mintSdkSessionToken({
      serviceType: 'FACE_LIVENESS_ONLY',
      // Identro requires a sourceType even for liveness-only sessions. Their
      // SDK contract uses UPLOADED_REFERENCE without requiring a reference
      // image when FACE_LIVENESS_ONLY is selected.
      sourceType: 'UPLOADED_REFERENCE',
      consentCaptured: dto.consentCaptured,
      consentReference: dto.consentReference,
      ...(dto.idempotencyKey && { idempotencyKey: dto.idempotencyKey }),
    });

    await this.prisma.riderLivenessVerification.create({
      data: {
        riderId: rider.id,
        userId,
        provider: 'identro',
        reference: session.sessionId,
        status: 'PENDING',
      },
    });

    return {
      sdkSessionToken: session.sdkToken,
      expiresAt: session.expiresAt,
      reference: session.sessionId,
    };
  }

  async getLivenessCredentials(userId: number, reference: string) {
    await this.requireOwnedLiveness(userId, reference);
    return this.identro.getLivenessCredentials(reference);
  }

  async completeLivenessSession(
    userId: number,
    reference: string,
    dto: CompleteLivenessSessionDto,
  ) {
    const record = await this.requireOwnedLiveness(userId, reference);
    if (record.status !== 'PENDING') {
      return {
        id: record.id,
        reference: record.reference,
        status: record.status,
        passed: record.status === 'APPROVED',
        score: record.confidenceScore == null ? null : Number(record.confidenceScore),
        verifiedAt: record.verifiedAt,
      };
    }

    const result = await this.identro.completeLivenessSession(reference, dto);
    const status =
      result.passed === true ? 'APPROVED' : result.passed === false ? 'REJECTED' : 'PENDING';
    const updated = await this.prisma.riderLivenessVerification.update({
      where: { id: record.id },
      data: {
        status,
        confidenceScore: result.score,
        verifiedAt: status === 'APPROVED' ? new Date() : null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorId: userId,
        action: 'RIDER_LIVENESS_PROVIDER_VERIFICATION',
        entity: 'RiderLivenessVerification',
        entityId: String(record.id),
        changes: {
          provider: 'identro',
          providerStatus: result.providerStatus,
          decision: result.decision,
          passed: result.passed,
          score: result.score,
          threshold: result.threshold,
          status,
        },
      },
    });

    return {
      id: updated.id,
      reference: updated.reference,
      status: updated.status,
      passed: result.passed,
      score: updated.confidenceScore == null ? null : Number(updated.confidenceScore),
      threshold: result.threshold,
      decision: result.decision,
      verifiedAt: updated.verifiedAt,
    };
  }

  private async requireOwnedLiveness(userId: number, reference: string) {
    const record = await this.prisma.riderLivenessVerification.findFirst({
      where: { userId, reference },
    });
    if (!record) {
      throw new NotFoundException('Liveness session not found or does not belong to this rider.');
    }
    return record;
  }

  async verifyRiderDocument(userId: number, dto: VerifyRiderDocumentDto) {
    const rider = await this.requireProfile(userId);

    const document = await this.prisma.riderDocument.findFirst({
      where: { id: dto.documentId, riderId: rider.id },
    });

    if (!document) {
      throw new NotFoundException('Rider document not found or does not belong to this rider.');
    }

    if (!document.documentNumber) {
      throw new BadRequestException('Document number is required for automated verification.');
    }

    const verifyResult = await this.dispatchDocumentVerify(document.type, document.documentNumber);

    const identroStatus = verifyResult.identroStatus ?? 'UNVERIFIED';
    const shouldApprove = identroStatus === 'VERIFIED' && this.identro.shouldAutoApprove;

    const updated = await this.prisma.riderDocument.update({
      where: { id: document.id },
      data: {
        qoreidStatus: identroStatus,
        qoreidReference: verifyResult.identroReference,
        qoreidRaw: verifyResult.identroRaw as object,
        ...(shouldApprove && { status: 'APPROVED' }),
      },
    });

    if (shouldApprove) {
      this.logger.log(`RiderDocument ${document.id} auto-approved by Identro (status=VERIFIED)`);
      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'DOCUMENT_AUTO_APPROVED',
          permission: 'kyc.review',
          entity: 'RiderDocument',
          entityId: String(document.id),
          changes: { identroStatus },
        },
      });
    }

    return updated;
  }

  async verifyGuarantorDocument(userId: number, dto: VerifyGuarantorDocumentDto) {
    const rider = await this.requireProfile(userId);

    const document = await this.prisma.guarantorDocument.findFirst({
      where: {
        id: dto.documentId,
        guarantor: { riderId: rider.id },
      },
    });

    if (!document) {
      throw new NotFoundException('Guarantor document not found or does not belong to this rider.');
    }

    if (!document.documentNumber) {
      throw new BadRequestException('Document number is required for automated verification.');
    }

    const verifyResult = await this.dispatchDocumentVerify(document.type, document.documentNumber);

    const identroStatus = verifyResult.identroStatus ?? 'UNVERIFIED';
    const shouldApprove = identroStatus === 'VERIFIED' && this.identro.shouldAutoApprove;

    const updated = await this.prisma.guarantorDocument.update({
      where: { id: document.id },
      data: {
        qoreidStatus: identroStatus,
        qoreidReference: verifyResult.identroReference,
        qoreidRaw: verifyResult.identroRaw as object,
        ...(shouldApprove && { status: 'APPROVED' }),
      },
    });

    if (shouldApprove) {
      this.logger.log(
        `GuarantorDocument ${document.id} auto-approved by Identro (status=VERIFIED)`,
      );
      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'GUARANTOR_DOCUMENT_AUTO_APPROVED',
          permission: 'kyc.review',
          entity: 'GuarantorDocument',
          entityId: String(document.id),
          changes: { identroStatus },
        },
      });
    }

    return updated;
  }

  private async dispatchDocumentVerify(type: string, documentNumber: string) {
    switch (type) {
      case 'NIN':
      case 'NIN_SLIP':
      case 'NATIONAL_ID':
        return this.identro.verifyNin(documentNumber);
      case 'DRIVERS_LICENSE':
        return this.identro.verifyDriversLicense(documentNumber);
      case 'VOTERS_CARD':
        return this.identro.verifyVotersCard(documentNumber);
      case 'INTERNATIONAL_PASSPORT':
        return this.identro.verifyNin(documentNumber);
      default:
        throw new BadRequestException(
          `Document type "${type}" is not supported for automated verification.`,
        );
    }
  }

  private safeLicence<T extends { providerRaw?: unknown }>(licence: T) {
    const safe = { ...licence };
    delete safe.providerRaw;
    return safe;
  }
}
