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
import { IdentroService } from '../identro/identro.service';
import { QoreIDService } from '../qoreid/qoreid.service';

@Injectable()
export class RidersService {
  private readonly logger = new Logger(RidersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly banks: BankResolverService,
    private readonly identro: IdentroService,
    private readonly qoreid: QoreIDService,
  ) {}

  getOnboardingRequirements() {
    return {
      profileMessage: 'Your Account is Under Review',
      requirements: [
        {
          key: 'identity',
          label: 'Identity / KYC',
          required: true,
          description: 'NIN/NIN slip or approved government-issued ID.',
        },
        {
          key: 'profilePhoto',
          label: 'Passport/profile photograph',
          required: true,
          description: 'Recent clear profile photograph.',
        },
        {
          key: 'liveness',
          label: 'Live selfie / liveness verification',
          required: true,
          description: 'Complete the supported liveness verification process.',
        },
        {
          key: 'riderLicence',
          label: 'Rider/motorcycle licence',
          required: true,
          description: 'Valid rider or motorcycle licence where applicable.',
        },
        {
          key: 'vehicleRegistration',
          label: 'Vehicle registration',
          required: true,
          description: 'Current registration and proof of lawful use.',
        },
        {
          key: 'vehiclePhoto',
          label: 'Vehicle photo',
          required: true,
          description: 'Clear vehicle and plate-number photographs.',
        },
        {
          key: 'insurance',
          label: 'Insurance',
          required: false,
          description: 'Required where applicable.',
        },
        {
          key: 'roadworthiness',
          label: 'Roadworthiness',
          required: false,
          description: 'Required where applicable.',
        },
        {
          key: 'guarantor',
          label: 'Guarantor',
          required: true,
          description: 'Guarantor profile and government-issued ID.',
        },
        {
          key: 'bankAccount',
          label: 'Bank account',
          required: true,
          description: 'Account details must be resolved and verified automatically.',
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

    const canSubmit =
      profile.documents.length > 0 &&
      profile.vehicles.length > 0 &&
      profile.bankAccounts.some((account) => account.verificationStatus === 'APPROVED');

    return {
      ...profile,
      statusMessage:
        profile.onboardingStatus === 'UNDER_REVIEW' ? 'Your Account is Under Review' : undefined,
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
      templateData: {
        status: updated.onboardingStatus,
        message: 'Our compliance team will review your documents.',
      },
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

  
  
  

  
  async mintKycSession(userId: number, dto: MintKycSessionDto) {
    const rider = await this.requireProfile(userId);

    const session = await this.identro.mintSdkSessionToken({
      serviceType: dto.serviceType,
      sourceType: dto.sourceType,
      ...(dto.nin && { nin: dto.nin }),
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

    
    let verifyResult = await this.dispatchDocumentVerify(document.type, document.documentNumber);

    
    let faceMatchScore: number | undefined;
    if (
      dto.selfieBase64 &&
      (document.type === 'NIN' ||
        document.type === 'NIN_SLIP' ||
        document.type === 'NATIONAL_ID' ||
        document.type === 'DRIVERS_LICENSE')
    ) {
      const idType =
        document.type === 'DRIVERS_LICENSE' ? 'DRIVERS_LICENSE' : 'NIN';
      const faceResult = await this.identro.verifyFace({
        nin: document.documentNumber,
        submittedFaceBase64: dto.selfieBase64,
        idType,
      });
      faceMatchScore = faceResult.faceMatchScore;
      
      verifyResult = {
        ...verifyResult,
        identroRaw: { ...verifyResult.identroRaw, faceVerification: faceResult.identroRaw },
      };
    }

    const identroStatus = verifyResult.identroStatus ?? 'UNVERIFIED';
    const shouldApprove = identroStatus === 'VERIFIED' && this.identro.shouldAutoApprove;

    const updated = await this.prisma.riderDocument.update({
      where: { id: document.id },
      data: {
        qoreidStatus: identroStatus,            
        qoreidReference: verifyResult.identroReference,
        qoreidRaw: verifyResult.identroRaw as object,
        ...(faceMatchScore !== undefined && { faceMatchScore }),
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
          changes: { identroStatus, faceMatchScore: faceMatchScore ?? null },
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
      this.logger.log(`GuarantorDocument ${document.id} auto-approved by Identro (status=VERIFIED)`);
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
}
