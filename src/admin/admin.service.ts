import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  async overview() {
    const [totalUsers, totalStores, totalOrders, totalRevenueResult, pendingApprovals] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.store.count({ where: { isActive: true } }),
        this.prisma.order.count(),
        this.prisma.payment.aggregate({
          _sum: { amount: true },
          where: { status: 'PAID' },
        }),
        this.prisma.riderProfile.count({ where: { onboardingStatus: 'UNDER_REVIEW' } }),
      ]);

    return {
      totalUsers,
      totalStores,
      totalOrders,
      totalRevenue: totalRevenueResult._sum.amount ? Number(totalRevenueResult._sum.amount) : 0,
      pendingApprovals,
    };
  }

  listRidersForReview() {
    return this.prisma.riderProfile.findMany({
      where: { onboardingStatus: 'UNDER_REVIEW' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
        documents: true,
        licences: true,
        liveness: true,
        vehicles: {
          include: {
            documents: true,
            verifications: true,
          },
        },
        bankAccounts: true,
        guarantors: {
          include: { documents: true },
        },
      },
      orderBy: { updatedAt: 'asc' },
    });
  }

  approveRider(riderId: number, reviewerId: number, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const rider = await tx.riderProfile.update({
        where: { id: riderId },
        data: {
          onboardingStatus: 'APPROVED',
          user: { update: { isEmailVerified: true } },
        },
        include: { user: true },
      });

      const role = await tx.role.findUnique({ where: { name: 'RIDER' } });
      if (role) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: rider.userId, roleId: role.id } },
          create: { userId: rider.userId, roleId: role.id },
          update: {},
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: reviewerId,
          action: 'RIDER_APPROVED',
          permission: 'kyc.review',
          entity: 'RiderProfile',
          entityId: String(riderId),
          changes: { reason: reason ?? null },
        },
      });

      return rider;
    });
  }

  rejectRider(riderId: number, reviewerId: number, reason?: string) {
    return this.prisma.$transaction(async (tx) => {
      const rider = await tx.riderProfile.update({
        where: { id: riderId },
        data: { onboardingStatus: 'REJECTED' },
      });

      await tx.auditLog.create({
        data: {
          actorId: reviewerId,
          action: 'RIDER_REJECTED',
          permission: 'kyc.review',
          entity: 'RiderProfile',
          entityId: String(riderId),
          changes: { reason: reason ?? null },
        },
      });

      return rider;
    });
  }

  async reviewDocument(
    documentId: number,
    reviewerId: number,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const document = await this.prisma.riderDocument.findUnique({
      where: { id: documentId },
    });

    if (!document) {
      throw new NotFoundException('Rider document not found.');
    }

    return this.prisma.riderDocument.update({
      where: { id: documentId },
      data: {
        status,
        rejectionReason: status === 'REJECTED' ? reason : null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
  }

  activateStore(storeId: number) {
    return this.prisma.store.update({
      where: { id: storeId },
      data: { isActive: true },
    });
  }

  async approveVendor(userId: number, reviewerId: number, reason?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendorProfile.update({
        where: { userId },
        data: {
          documentReviewStatus: 'APPROVED',
        },
      });

      const role = await tx.role.findUnique({ where: { name: 'VENDOR' } });
      if (role) {
        await tx.userRole.upsert({
          where: { userId_roleId: { userId: vendor.userId, roleId: role.id } },
          create: { userId: vendor.userId, roleId: role.id },
          update: {},
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: reviewerId,
          action: 'VENDOR_APPROVED',
          permission: 'merchants.approve',
          entity: 'VendorProfile',
          entityId: String(userId),
          changes: { reason: reason ?? null },
        },
      });

      return vendor;
    });

    
    
    await this.notifications.notifyUser({
      userId,
      type: 'VENDOR_APPROVED',
      priority: 'HIGH',
      title: '🎉 Vendor application approved!',
      message: 'Congratulations! Your vendor application has been approved. You can now set up your store.',
      data: { vendorProfileId: result.id, status: 'APPROVED' },
      templateKey: 'vendorApproval',
      templateData: { status: 'APPROVED', reason },
    });

    return result;
  }

  async rejectVendor(userId: number, reviewerId: number, reason?: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const vendor = await tx.vendorProfile.update({
        where: { userId },
        data: {
          documentReviewStatus: 'REJECTED',
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: reviewerId,
          action: 'VENDOR_REJECTED',
          permission: 'merchants.approve',
          entity: 'VendorProfile',
          entityId: String(userId),
          changes: { reason: reason ?? null },
        },
      });

      return vendor;
    });

    
    await this.notifications.notifyUser({
      userId,
      type: 'VENDOR_REJECTED',
      priority: 'HIGH',
      title: 'Vendor application not approved',
      message: reason
        ? `Your vendor application was not approved. Reason: ${reason}`
        : 'Your vendor application was not approved. Please check your email for details.',
      data: { vendorProfileId: result.id, status: 'REJECTED' },
      templateKey: 'vendorApproval',
      templateData: { status: 'REJECTED', reason },
    });

    return result;
  }
}
