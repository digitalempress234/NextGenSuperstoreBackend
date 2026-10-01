import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BankResolverService } from './bank-resolver.service';
import {
  CreateBankAccountDto,
  CreateGuarantorDocumentDto,
  CreateGuarantorDto,
  CreateRiderLicenceDto,
  CreateRiderDocumentDto,
  CreateVehicleDocumentDto,
  CreateVehicleDto,
  MintKycSessionDto,
  UpdateRiderProfileDto,
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
              label: 'Submit licence number for automatic verification',
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
              label: 'Provider-verified driving/rider licence',
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
    return this.notifications.list(userId, { page, limit });
  }

  async settings(userId: number) {
    const [profile, notificationPreferences] = await Promise.all([
      this.getProfile(userId),
      this.notifications.preferences(userId),
    ]);
    return { profile, notificationPreferences };
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
        number: dto.number,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
        documentUrl: dto.documentUrl,
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
      if (dto.isPrimary) {
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
          isPrimary: dto.isPrimary ?? false,
        },
      });
    });
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
      ...(dto.consentReference && { consentReference: dto.consentReference }),
      ...(dto.idempotencyKey && { idempotencyKey: dto.idempotencyKey }),

      subjectRef: `rider-${rider.id}`,
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
    };
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
