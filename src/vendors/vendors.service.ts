import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { IdentroService } from '../identro/identro.service';
import { QoreIDService } from '../qoreid/qoreid.service';
import { UpdateVendorProfileDto, VendorNinVerifyDto, VendorCacVerifyDto } from './dto/vendor.dto';

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly identro: IdentroService,
    private readonly qoreid: QoreIDService,
  ) {}

  

  async getProfile(userId: number) {
    return this.prisma.vendorProfile.findUnique({
      where: { userId },
      include: { ninVerification: true, cacVerification: true },
    });
  }

  async updateProfile(userId: number, dto: UpdateVendorProfileDto) {
    const profile = await this.prisma.vendorProfile.upsert({
      where: { userId },
      create: { userId, ...dto, onboardingStatus: 'PROFILE_COMPLETED' },
      update: dto,
    });

    
    if (profile.onboardingStatus === 'CREATED') {
      return this.prisma.vendorProfile.update({
        where: { id: profile.id },
        data: { onboardingStatus: 'PROFILE_COMPLETED' },
        include: { ninVerification: true, cacVerification: true },
      });
    }

    return profile;
  }

  

  
  async verifyNin(userId: number, dto: VendorNinVerifyDto) {
    const vendor = await this.requireProfile(userId);

    
    let verifyResult = await this.identro.verifyNin(dto.ninNumber);

    
    let faceMatchScore: number | undefined;
    if (dto.selfieBase64) {
      const faceResult = await this.identro.verifyFace({
        nin: dto.ninNumber,
        submittedFaceBase64: dto.selfieBase64,
      });
      faceMatchScore = faceResult.faceMatchScore;
      
      verifyResult = {
        ...verifyResult,
        identroRaw: { ...verifyResult.identroRaw, faceVerification: faceResult.identroRaw },
      };
    }

    const identroStatus = verifyResult.identroStatus ?? 'UNVERIFIED';
    const isAutoApproved = identroStatus === 'VERIFIED' && this.identro.shouldAutoApprove;

    const ninRecord = await this.prisma.vendorNinVerification.upsert({
      where: { vendorProfileId: vendor.id },
      create: {
        vendorProfileId: vendor.id,
        ninNumber: dto.ninNumber,
        qoreidStatus: identroStatus,          
        qoreidReference: verifyResult.identroReference,
        qoreidRaw: verifyResult.identroRaw as object,
        ...(faceMatchScore !== undefined && { faceMatchScore }),
        status: isAutoApproved ? 'APPROVED' : 'PENDING',
      },
      update: {
        ninNumber: dto.ninNumber,
        qoreidStatus: identroStatus,
        qoreidReference: verifyResult.identroReference,
        qoreidRaw: verifyResult.identroRaw as object,
        ...(faceMatchScore !== undefined && { faceMatchScore }),
        status: isAutoApproved ? 'APPROVED' : 'PENDING',
      },
    });

    if (isAutoApproved) {
      await this.prisma.vendorProfile.update({
        where: { id: vendor.id },
        data: { onboardingStatus: 'NIN_VERIFIED' },
      });
      this.logger.log(`VendorProfile ${vendor.id} NIN auto-approved by Identro`);
      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'DOCUMENT_AUTO_APPROVED',
          permission: 'kyc.review',
          entity: 'VendorNinVerification',
          entityId: String(ninRecord.id),
          changes: { identroStatus, faceMatchScore: faceMatchScore ?? null },
        },
      });
    }

    return {
      id: ninRecord.id,
      status: ninRecord.status,
      identroStatus,
      faceMatchScore: ninRecord.faceMatchScore ?? null,
    };
  }

  

  
  async verifyCac(userId: number, dto: VendorCacVerifyDto) {
    const vendor = await this.requireProfile(userId);

    
    const regUpper = dto.regNumber.toUpperCase();
    const companyType = regUpper.startsWith('BN')
      ? 'BUSINESS_NAME'
      : regUpper.startsWith('IT')
        ? 'INCORPORATED_TRUSTEES'
        : 'COMPANY';

    const cacResult = await this.identro.verifyCac(dto.regNumber, companyType);

    
    let tinRaw: Record<string, unknown> | undefined;
    let tinVerified = false;
    if (dto.verifyTin) {
      try {
        tinRaw = await this.identro.verifyTin(dto.regNumber) as Record<string, unknown>;
        const tinData = (tinRaw as { data?: { status?: string } }).data;
        tinVerified = this.identro.normaliseStatus(tinData?.status ?? null) === 'VERIFIED';
      } catch (err) {
        this.logger.warn(`Optional TIN verification failed for ${dto.regNumber}: ${String(err)}`);
      }
    }

    const isAutoApproved = cacResult.identroStatus === 'VERIFIED' && this.identro.shouldAutoApprove;

    const cacRecord = await this.prisma.vendorCacVerification.upsert({
      where: { vendorProfileId: vendor.id },
      create: {
        vendorProfileId: vendor.id,
        regNumber: dto.regNumber,
        qoreidStatus: cacResult.identroStatus,    
        qoreidReference: cacResult.identroReference,
        qoreidRaw: cacResult.identroRaw as object,
        companyName: cacResult.companyName,
        companyType: cacResult.companyType,
        incorporatedAt: cacResult.incorporatedAt,
        status: isAutoApproved ? 'APPROVED' : 'PENDING',
        ...(tinRaw !== undefined && { tinQoreidRaw: tinRaw as object, tinVerified }),
      },
      update: {
        regNumber: dto.regNumber,
        qoreidStatus: cacResult.identroStatus,
        qoreidReference: cacResult.identroReference,
        qoreidRaw: cacResult.identroRaw as object,
        companyName: cacResult.companyName,
        companyType: cacResult.companyType,
        incorporatedAt: cacResult.incorporatedAt,
        status: isAutoApproved ? 'APPROVED' : 'PENDING',
        ...(tinRaw !== undefined && { tinQoreidRaw: tinRaw as object, tinVerified }),
      },
    });

    if (isAutoApproved) {
      await this.prisma.vendorProfile.update({
        where: { id: vendor.id },
        data: { onboardingStatus: 'CAC_VERIFIED' },
      });
      this.logger.log(`VendorProfile ${vendor.id} CAC auto-approved by Identro`);
      await this.prisma.auditLog.create({
        data: {
          actorId: null,
          action: 'DOCUMENT_AUTO_APPROVED',
          permission: 'kyc.review',
          entity: 'VendorCacVerification',
          entityId: String(cacRecord.id),
          changes: { identroStatus: cacResult.identroStatus, tinVerified },
        },
      });
    }

    return {
      id: cacRecord.id,
      status: cacRecord.status,
      companyName: cacRecord.companyName,
      companyType: cacRecord.companyType,
      incorporatedAt: cacRecord.incorporatedAt,
      tinVerified: cacRecord.tinVerified,
    };
  }

  

  
  async submitForReview(userId: number) {
    const vendor = await this.prisma.vendorProfile.findUnique({
      where: { userId },
      include: { ninVerification: true, cacVerification: true },
    });

    if (!vendor) {
      throw new NotFoundException('Vendor profile not found. Please complete your profile first.');
    }

    if (!vendor.ninVerification) {
      throw new BadRequestException('NIN identity verification is required before submission.');
    }

    if (!vendor.cacVerification) {
      throw new BadRequestException(
        'Business (CAC) registration verification is required before submission.',
      );
    }

    const updated = await this.prisma.vendorProfile.update({
      where: { id: vendor.id },
      data: { onboardingStatus: 'UNDER_REVIEW', documentReviewStatus: 'PENDING' },
    });

    await this.notifications.notifyUser({
      userId,
      type: 'VENDOR_APPROVED',
      title: 'Vendor application submitted',
      message: 'Your vendor application is now under review. We will notify you once approved.',
      data: { vendorProfileId: updated.id, status: updated.onboardingStatus },
      templateKey: 'kycUpdate',
      templateData: {
        status: updated.onboardingStatus,
        message: 'Our team will review your business documents shortly.',
      },
    });

    return {
      id: updated.id,
      onboardingStatus: updated.onboardingStatus,
      statusMessage: 'Your vendor application is under review.',
    };
  }

  

  private async requireProfile(userId: number) {
    const vendor = await this.prisma.vendorProfile.findUnique({ where: { userId } });
    if (!vendor) {
      throw new NotFoundException('Vendor profile not found. Please complete your profile first.');
    }
    return vendor;
  }
}
