import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
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

  // ─── Submit CAC for verification ─────────────────────────────────────────────

  /**
   * Submit (or re-submit) a CAC registration number for a store.
   * Calls QoreID CAC Basic and persists the raw response.
   * If a prior record exists it is updated in-place; otherwise a new one is created.
   */
  async submit(userId: number, storeId: number, regNumber: string) {
    // Gate: store must belong to the calling user
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, ownerUserId: userId },
    });

    if (!store) {
      throw new NotFoundException('Store not found or you do not own it.');
    }

    // Prevent re-submission if already APPROVED
    const existing = await this.prisma.storeCacVerification.findFirst({
      where: { storeId, status: DocumentStatus.APPROVED },
    });

    if (existing) {
      throw new BadRequestException(
        'This store already has an approved CAC verification.',
      );
    }

    this.logger.log(
      `Calling QoreID CAC Basic for store ${storeId} — regNumber: ${regNumber}`,
    );

    const extracted = await this.qoreid.verifyCac(regNumber);

    // Upsert: update if one exists (PENDING/REJECTED), create otherwise
    const record = await this.prisma.storeCacVerification.upsert({
      where: {
        // Use a unique index on storeId + regNumber (or storeId alone for 1-per-store)
        // We'll use storeId as the natural unique key since a store has one CAC
        id: (
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

  // ─── Get CAC status for a store ───────────────────────────────────────────────

  /** Returns the latest CAC verification record for a store (owner or admin). */
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
        // Omit qoreidRaw — internal audit field, never exposed to API clients
      },
    });

    return record ?? null;
  }

  // ─── Admin: Review CAC ────────────────────────────────────────────────────────

  /**
   * Approve or reject a CAC verification record.
   * Also activates/deactivates the store based on outcome.
   */
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

    const newStatus =
      decision === 'APPROVED' ? DocumentStatus.APPROVED : DocumentStatus.REJECTED;

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
      // Activate store only on approval; deactivate on rejection
      this.prisma.store.update({
        where: { id: record.storeId },
        data: { isActive: decision === 'APPROVED' },
      }),
    ]);

    return updated;
  }

  // ─── Admin: List pending CAC verifications ────────────────────────────────────

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
