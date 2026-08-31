import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { BankResolverService } from './bank-resolver.service';
import {
  CreateBankAccountDto,
  CreateGuarantorDto,
  CreateRiderDocumentDto,
  CreateVehicleDto,
  MintKycSessionDto,
  UpdateRiderProfileDto,
  VerifyGuarantorDocumentDto,
  VerifyRiderDocumentDto,
} from './dto/rider.dto';
// [QoreID] — added import
import { QoreIDService } from '../qoreid/qoreid.service';

@Injectable()
export class RidersService {
  private readonly logger = new Logger(RidersService.name);

  // [QoreID] Original constructor (kept for rollback):
  // constructor(
  //   private readonly prisma: PrismaService,
  //   private readonly notifications: NotificationsService,
  //   private readonly banks: BankResolverService,
  // ) {}
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly banks: BankResolverService,
    private readonly qoreid: QoreIDService,
  ) {}


  getOnboardingRequirements() {
    return {
      profileMessage: 'Your Account is Under Review',
      requirements: [
        { key: 'identity', label: 'Identity / KYC', required: true, description: 'NIN/NIN slip or approved government-issued ID.' },
        { key: 'profilePhoto', label: 'Passport/profile photograph', required: true, description: 'Recent clear profile photograph.' },
        { key: 'liveness', label: 'Live selfie / liveness verification', required: true, description: 'Complete the supported liveness verification process.' },
        { key: 'riderLicence', label: 'Rider/motorcycle licence', required: true, description: 'Valid rider or motorcycle licence where applicable.' },
        { key: 'vehicleRegistration', label: 'Vehicle registration', required: true, description: 'Current registration and proof of lawful use.' },
        { key: 'vehiclePhoto', label: 'Vehicle photo', required: true, description: 'Clear vehicle and plate-number photographs.' },
        { key: 'insurance', label: 'Insurance', required: false, description: 'Required where applicable.' },
        { key: 'roadworthiness', label: 'Roadworthiness', required: false, description: 'Required where applicable.' },
        { key: 'guarantor', label: 'Guarantor', required: true, description: 'Guarantor profile and government-issued ID.' },
        { key: 'bankAccount', label: 'Bank account', required: true, description: 'Account details must be resolved and verified automatically.' },
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

    const canSubmit =
      profile.documents.length > 0 &&
      profile.vehicles.length > 0 &&
      profile.bankAccounts.some((account) => account.verificationStatus === 'APPROVED');

    return {
      ...profile,
      statusMessage: profile.onboardingStatus === 'UNDER_REVIEW' ? 'Your Account is Under Review' : undefined,
      canSubmit,
    };
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

  async submitForReview(userId: number) {
    const rider = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        documents: true,
        vehicles: { include: { documents: true } },
        bankAccounts: true,
      },
    });

    if (!rider) {
      throw new NotFoundException('Rider profile not found.');
    }

    if (rider.documents.length === 0) {
      throw new BadRequestException('At least one identity document is required.');
    }

    if (rider.vehicles.length === 0) {
      throw new BadRequestException('At least one vehicle is required.');
    }

    if (rider.bankAccounts.length === 0) {
      throw new BadRequestException('A verified payout bank account is required.');
    }

    if (!rider.bankAccounts.some((account) => account.verificationStatus === 'APPROVED')) {
      throw new BadRequestException('Your payout bank account must be verified before submission.');
    }

    const updated = await this.prisma.riderProfile.update({
      where: { id: rider.id },
      data: { onboardingStatus: 'UNDER_REVIEW' },
    });

    await this.notifications.notifyUser({
      userId,
      type: 'KYC_UPDATE',
      title: 'Rider verification submitted',
      message: 'Your rider application is now under review.',
      data: { riderId: updated.id, status: updated.onboardingStatus },
      templateKey: 'kycUpdate',
      templateData: { status: updated.onboardingStatus, message: 'Our compliance team will review your documents.' },
    });

    return { ...updated, statusMessage: 'Your Account is Under Review', canSubmit: false };
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

  // ─────────────────────────────────────────────────────────────────────────────
  // QoreID KYC methods
  // Appended below — all methods above are untouched.
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Mints a short-lived QoreID SDK session token for liveness verification.
   * Only the `sdkSessionToken` is returned to the client — credentials never leave the server.
   */
  async mintKycSession(userId: number, dto: MintKycSessionDto) {
    const rider = await this.requireProfile(userId);

    const session = await this.qoreid.mintSdkSessionToken({
      productCode: dto.productCode,
      reference: dto.reference,
      ttlSeconds: dto.ttlSeconds,
      // Use a pseudonymous subject ref — never include PII
      subjectRef: `rider-${rider.id}`,
    });

    // Record the pending liveness verification so it can be updated by the webhook / admin later
    await this.prisma.riderLivenessVerification.create({
      data: {
        riderId: rider.id,
        userId,
        provider: 'qoreid',
        reference: session.sessionId,
        status: 'PENDING',
      },
    });

    // Return only the session token — never expose clientId/secret
    return {
      sdkSessionToken: session.sdkSessionToken,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Triggers automated QoreID identity verification for a specific RiderDocument.
   * Optionally runs a face-match if a selfie base64 is provided.
   * If QOREID_AUTO_APPROVE_ON_MATCH=true and QoreID returns VERIFIED, the document is auto-approved.
   */
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

    // Dispatch to the correct QoreID endpoint based on document type
    let verifyResult = await this.dispatchDocumentVerify(document.type, document.documentNumber);

    // Optionally run face-match if selfie is provided and document type supports it
    let faceMatchScore: number | undefined;
    if (dto.selfieBase64 && (document.type === 'NIN' || document.type === 'NIN_SLIP')) {
      const faceResult = await this.qoreid.verifyNinFace({
        idNumber: document.documentNumber,
        photoBase64: dto.selfieBase64,
      });
      faceMatchScore = faceResult.faceMatchScore;
      // Merge face-match response for audit
      verifyResult = { ...verifyResult, faceVerification: faceResult };
    } else if (dto.selfieBase64 && document.type === 'DRIVERS_LICENSE') {
      const faceResult = await this.qoreid.verifyDriversLicenseFace({
        idNumber: document.documentNumber,
        photoBase64: dto.selfieBase64,
      });
      faceMatchScore = faceResult.faceMatchScore;
      verifyResult = { ...verifyResult, faceVerification: faceResult };
    }

    const qoreidStatus = verifyResult.summary?.status ?? 'UNVERIFIED';
    const shouldApprove =
      qoreidStatus === 'VERIFIED' && this.qoreid.shouldAutoApprove;

    const updated = await this.prisma.riderDocument.update({
      where: { id: document.id },
      data: {
        qoreidStatus,
        qoreidReference: verifyResult.summary?.state ?? null,
        qoreidRaw: verifyResult as object,
        ...(faceMatchScore !== undefined && { faceMatchScore }),
        ...(shouldApprove && { status: 'APPROVED' }),
      },
    });

    if (shouldApprove) {
      this.logger.log(
        `RiderDocument ${document.id} auto-approved by QoreID (status=VERIFIED)`,
      );
      await this.prisma.auditLog.create({
        data: {
          actorId: null, // system action
          action: 'DOCUMENT_AUTO_APPROVED',
          permission: 'kyc.review',
          entity: 'RiderDocument',
          entityId: String(document.id),
          changes: { qoreidStatus, faceMatchScore: faceMatchScore ?? null },
        },
      });
    }

    return updated;
  }

  /**
   * Triggers automated QoreID name/ID check on a GuarantorDocument.
   * No face-match — the guarantor is not present during onboarding.
   */
  async verifyGuarantorDocument(userId: number, dto: VerifyGuarantorDocumentDto) {
    const rider = await this.requireProfile(userId);

    // Ensure the document belongs to a guarantor of this rider
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

    const verifyResult = await this.dispatchDocumentVerify(
      document.type,
      document.documentNumber,
    );

    const qoreidStatus = verifyResult.summary?.status ?? 'UNVERIFIED';
    const shouldApprove =
      qoreidStatus === 'VERIFIED' && this.qoreid.shouldAutoApprove;

    const updated = await this.prisma.guarantorDocument.update({
      where: { id: document.id },
      data: {
        qoreidStatus,
        qoreidReference: verifyResult.summary?.state ?? null,
        qoreidRaw: verifyResult as object,
        ...(shouldApprove && { status: 'APPROVED' }),
      },
    });

    if (shouldApprove) {
      this.logger.log(
        `GuarantorDocument ${document.id} auto-approved by QoreID (status=VERIFIED)`,
      );
      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'GUARANTOR_DOCUMENT_AUTO_APPROVED',
          permission: 'kyc.review',
          entity: 'GuarantorDocument',
          entityId: String(document.id),
          changes: { qoreidStatus },
        },
      });
    }

    return updated;
  }

  /**
   * Internal helper — routes a document verification call to the correct QoreID method.
   * Guarantor callers do not pass selfieBase64 (no face check).
   */
  private async dispatchDocumentVerify(type: string, idNumber: string) {
    switch (type) {
      case 'NIN':
      case 'NIN_SLIP':
      case 'NATIONAL_ID':
        return this.qoreid.verifyNin(idNumber, { firstname: '', lastname: '' });
      case 'DRIVERS_LICENSE':
        return this.qoreid.verifyDriversLicense(idNumber, { firstname: '', lastname: '' });
      case 'VOTERS_CARD':
        return this.qoreid.verifyVotersCard(idNumber, { firstname: '', lastname: '', dob: '' });
      case 'INTERNATIONAL_PASSPORT':
        return this.qoreid.verifyPassport(idNumber, { firstname: '', lastname: '' });
      default:
        throw new BadRequestException(
          `Document type "${type}" is not supported for automated verification.`,
        );
    }
  }
}
