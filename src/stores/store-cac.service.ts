import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { QoreIDService } from '../qoreid/qoreid.service';

@Injectable()
export class StoreCacService {
  private readonly logger = new Logger(StoreCacService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly qoreid: QoreIDService,
  ) {}

  

  
  async submit(userId: number, storeId: number, regNumber: string) {
    
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, ownerUserId: userId },
    });

    if (!store) {
      throw new NotFoundException('Store not found or you do not own it.');
    }

    
    const existing = await this.prisma.storeCacVerification.findFirst({
      where: { storeId, status: DocumentStatus.APPROVED },
    });

    if (existing) {
      throw new BadRequestException('This store already has an approved CAC verification.');
    }

    this.logger.log(`Calling QoreID CAC Basic for store ${storeId} — regNumber: ${regNumber}`);

    const extracted = await this.qoreid.verifyCac(regNumber);

    
    const record = await this.prisma.storeCacVerification.upsert({
      where: {
        
        
        id:
          (
            await this.prisma.storeCacVerification.findFirst({
              where: { storeId },
              select: { id: true },
            })
          )?.id ?? 0,
      },
      create: {
        storeId,
        regNumber: regNumber.toUpperCase(),
        status: DocumentStatus.PENDING,
        ...extracted,
        qoreidRaw: extracted.qoreidRaw as Prisma.InputJsonValue,
      },
      update: {
        regNumber: regNumber.toUpperCase(),
        status: DocumentStatus.PENDING,
        rejectionReason: null,
        reviewedById: null,
        reviewedAt: null,
        ...extracted,
        qoreidRaw: extracted.qoreidRaw as Prisma.InputJsonValue,
      },
    });

    return record;
  }

  

  
  async getStatus(userId: number, storeId: number) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, ownerUserId: userId },
    });

    if (!store) {
      throw new NotFoundException('Store not found or you do not own it.');
    }

    const record = await this.prisma.storeCacVerification.findFirst({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        regNumber: true,
        status: true,
        companyName: true,
        companyType: true,
        incorporatedAt: true,
        qoreidStatus: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
        updatedAt: true,
        
      },
    });

    return record ?? null;
  }

  

  
  async review(
    reviewerId: number,
    verificationId: number,
    decision: 'APPROVED' | 'REJECTED',
    rejectionReason?: string,
  ) {
    const record = await this.prisma.storeCacVerification.findUnique({
      where: { id: verificationId },
    });

    if (!record) {
      throw new NotFoundException('CAC verification record not found.');
    }

    if (record.status === DocumentStatus.APPROVED) {
      throw new BadRequestException('This verification is already approved.');
    }

    const newStatus = decision === 'APPROVED' ? DocumentStatus.APPROVED : DocumentStatus.REJECTED;

    const [updated] = await this.prisma.$transaction([
      this.prisma.storeCacVerification.update({
        where: { id: verificationId },
        data: {
          status: newStatus,
          rejectionReason: decision === 'REJECTED' ? rejectionReason : null,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
        },
      }),
      
      this.prisma.store.update({
        where: { id: record.storeId },
        data: { isActive: decision === 'APPROVED' },
      }),
    ]);

    return updated;
  }

  

  listPending() {
    return this.prisma.storeCacVerification.findMany({
      where: { status: DocumentStatus.PENDING },
      include: {
        store: {
          select: {
            id: true,
            storeName: true,
            state: true,
            city: true,
            owner: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
