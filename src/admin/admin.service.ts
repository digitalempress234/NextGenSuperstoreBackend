import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ADMIN_INTERVENTION_ORDER_STATUSES, canTransitionOrder } from '../orders/order-status';
import { completeOrder } from '../orders/complete-order';
import { assessRiderReadiness } from '../riders/rider-readiness';

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

  async updateOrderStatus(
    orderId: number,
    staffActorId: number,
    status: OrderStatus,
    reason: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({ where: { id: orderId } });
      if (!order) throw new NotFoundException('Order not found.');
      if (!ADMIN_INTERVENTION_ORDER_STATUSES.includes(status)) {
        throw new BadRequestException(
          'Payment confirmation and cancellation must use their dedicated financial workflows.',
        );
      }
      if (!canTransitionOrder(order.currentStatus, status)) {
        throw new BadRequestException(
          `Invalid order transition: ${order.currentStatus} -> ${status}`,
        );
      }

      if (status === 'COMPLETED') {
        await completeOrder(tx, order, undefined, `Staff intervention: ${reason}`);
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: { currentStatus: status },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId,
            fromStatus: order.currentStatus,
            toStatus: status,
            reason: `Staff intervention: ${reason}`,
          },
        });
      }
      await tx.auditLog.create({
        data: {
          staffActorId,
          action: 'order.status.update',
          permission: 'orders.status.update',
          entity: 'Order',
          entityId: String(orderId),
          changes: {
            fromStatus: order.currentStatus,
            toStatus: status,
            reason,
          },
        },
      });
      return tx.order.findUniqueOrThrow({ where: { id: orderId } });
    });
  }

  private result<T>(items: T[], total: number, page: number, limit: number) {
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  async customers(paging: { page: number; limit: number }, search?: string, status?: string) {
    const where: any = {
      roles: { some: { role: { name: 'CUSTOMER' } } },
      ...(status ? { status } : {}),
      ...(search
        ? {
            OR: [
              { email: { contains: search } },
              { firstName: { contains: search } },
              { lastName: { contains: search } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phoneNumber: true,
          avatarUrl: true,
          status: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (paging.page - 1) * paging.limit,
        take: paging.limit,
      }),
      this.prisma.user.count({ where }),
    ]);
    return this.result(items, total, paging.page, paging.limit);
  }

  async customer(id: number) {
    const item = await this.prisma.user.findUnique({
      where: { id },
      include: {
        roles: { include: { role: true } },
        addresses: true,
        wallet: true,
        rewardAccount: true,
        orders: { take: 15, orderBy: { placedAt: 'desc' } },
        supportTickets: { take: 15, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!item) throw new NotFoundException('Customer not found.');
    return item;
  }

  async orders(paging: { page: number; limit: number }, status?: string) {
    const where: any = status ? { currentStatus: status } : {};
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          store: { select: { id: true, storeName: true } },
          payment: true,
        },
        orderBy: { placedAt: 'desc' },
        skip: (paging.page - 1) * paging.limit,
        take: paging.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return this.result(items, total, paging.page, paging.limit);
  }

  async order(id: number) {
    const item = await this.prisma.order.findUnique({
      where: { id },
      include: {
        user: true,
        store: true,
        items: true,
        payment: true,
        delivery: { include: { rider: true } },
        pickup: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
        returns: true,
      },
    });
    if (!item) throw new NotFoundException('Order not found.');
    return item;
  }

  async payouts(paging: { page: number; limit: number }, status?: string) {
    const where: any = status ? { status } : {};
    const take = paging.page * paging.limit;
    const [users, stores, totalUsers, totalStores] = await Promise.all([
      this.prisma.withdrawal.findMany({
        where,
        include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.storeWithdrawal.findMany({
        where,
        include: { store: { select: { id: true, storeName: true } } },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.withdrawal.count({ where }),
      this.prisma.storeWithdrawal.count({ where }),
    ]);
    const all = [
      ...users.map((item) => ({ source: 'USER', ...item })),
      ...stores.map((item) => ({ source: 'STORE', ...item })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const items = all.slice((paging.page - 1) * paging.limit, paging.page * paging.limit);
    return this.result(items, totalUsers + totalStores, paging.page, paging.limit);
  }

  async payout(source: string, id: number) {
    const item =
      source.toUpperCase() === 'STORE'
        ? await this.prisma.storeWithdrawal.findUnique({
            where: { id },
            include: { store: true, wallet: true },
          })
        : await this.prisma.withdrawal.findUnique({ where: { id }, include: { user: true } });
    if (!item) throw new NotFoundException('Payout not found.');
    return { source: source.toUpperCase(), ...item };
  }

  async stores(paging: { page: number; limit: number }, active?: string) {
    const where = active === undefined ? {} : { isActive: active === 'true' };
    const [items, total] = await Promise.all([
      this.prisma.store.findMany({
        where,
        include: {
          owner: { select: { id: true, email: true, firstName: true, lastName: true } },
          category: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (paging.page - 1) * paging.limit,
        take: paging.limit,
      }),
      this.prisma.store.count({ where }),
    ]);
    return this.result(items, total, paging.page, paging.limit);
  }
  async store(id: number) {
    const item = await this.prisma.store.findUnique({
      where: { id },
      include: {
        owner: true,
        category: true,
        images: true,
        members: { include: { user: true } },
        products: { include: { product: true } },
        wallet: true,
        cacVerifications: true,
      },
    });
    if (!item) throw new NotFoundException('Store not found.');
    return item;
  }

  async riders(paging: { page: number; limit: number }, status?: string) {
    const where: any = status ? { onboardingStatus: status } : {};
    const [items, total] = await Promise.all([
      this.prisma.riderProfile.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, phoneNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (paging.page - 1) * paging.limit,
        take: paging.limit,
      }),
      this.prisma.riderProfile.count({ where }),
    ]);
    return this.result(items, total, paging.page, paging.limit);
  }
  async rider(id: number) {
    const item = await this.prisma.riderProfile.findUnique({
      where: { id },
      include: {
        user: true,
        documents: true,
        licences: true,
        liveness: true,
        vehicles: { include: { documents: true, verifications: true } },
        bankAccounts: true,
        guarantors: { include: { documents: true } },
      },
    });
    if (!item) throw new NotFoundException('Rider not found.');
    return item;
  }

  async vendors(paging: { page: number; limit: number }, status?: string) {
    const where: any = status ? { onboardingStatus: status } : {};
    const [items, total] = await Promise.all([
      this.prisma.vendorProfile.findMany({
        where,
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, phoneNumber: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (paging.page - 1) * paging.limit,
        take: paging.limit,
      }),
      this.prisma.vendorProfile.count({ where }),
    ]);
    return this.result(items, total, paging.page, paging.limit);
  }
  async vendor(userId: number) {
    const item = await this.prisma.vendorProfile.findUnique({
      where: { userId },
      include: {
        user: { include: { storesOwned: true, storeMemberships: { include: { store: true } } } },
        ninVerification: true,
        cacVerification: true,
      },
    });
    if (!item) throw new NotFoundException('Vendor not found.');
    return item;
  }

  async campaigns(paging: { page: number; limit: number }, active?: string) {
    const where = active === undefined ? {} : { isActive: active === 'true' };
    const [items, total] = await Promise.all([
      this.prisma.rewardVoucher.findMany({
        where,
        include: { store: { select: { id: true, storeName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (paging.page - 1) * paging.limit,
        take: paging.limit,
      }),
      this.prisma.rewardVoucher.count({ where }),
    ]);
    return this.result(items, total, paging.page, paging.limit);
  }
  async campaign(id: string) {
    const item = await this.prisma.rewardVoucher.findUnique({
      where: { id },
      include: { store: true, owners: { take: 15, orderBy: { claimedAt: 'desc' } } },
    });
    if (!item) throw new NotFoundException('Campaign not found.');
    return item;
  }

  async listRidersForReview() {
    const riders = await this.prisma.riderProfile.findMany({
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
    return riders.map((rider) => ({ ...rider, readiness: assessRiderReadiness(rider) }));
  }

  async approveRider(riderId: number, reviewerId: number, reason?: string) {
    const rider = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.riderProfile.findUnique({
        where: { id: riderId },
        include: {
          documents: true,
          licences: true,
          liveness: true,
          vehicles: { include: { documents: true } },
          bankAccounts: true,
        },
      });
      if (!candidate) throw new NotFoundException('Rider profile not found.');
      if (candidate.onboardingStatus !== 'UNDER_REVIEW') {
        throw new BadRequestException('Only riders under review can be approved.');
      }
      const readiness = assessRiderReadiness(candidate);
      if (readiness.missingOperationalRequirements.length) {
        throw new BadRequestException({
          message: 'Rider has not completed operational verification.',
          missingRequirements: readiness.missingOperationalRequirements,
        });
      }
      const rider = await tx.riderProfile.update({
        where: { id: riderId },
        data: {
          onboardingStatus: 'APPROVED',
          rejectionReason: null,
          rejectedAt: null,
          rejectedEvidence: Prisma.DbNull,
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
          staffActorId: reviewerId,
          action: 'RIDER_APPROVED',
          permission: 'kyc.review',
          entity: 'RiderProfile',
          entityId: String(riderId),
          changes: { reason: reason ?? null },
        },
      });

      return rider;
    });
    await this.notifyRiderDecision(rider.userId, rider.id, 'APPROVED', reason);
    return rider;
  }

  async rejectRider(riderId: number, reviewerId: number, reason?: string) {
    const rider = await this.prisma.$transaction(async (tx) => {
      const candidate = await tx.riderProfile.findUnique({
        where: { id: riderId },
        include: {
          documents: true,
          licences: true,
          liveness: true,
          vehicles: { include: { documents: true } },
        },
      });
      if (!candidate) throw new NotFoundException('Rider profile not found.');
      if (candidate.onboardingStatus !== 'UNDER_REVIEW') {
        throw new BadRequestException('Only riders under review can be rejected.');
      }
      const rider = await tx.riderProfile.update({
        where: { id: riderId },
        data: {
          onboardingStatus: 'REJECTED',
          rejectionReason: reason ?? 'Application rejected.',
          rejectedAt: new Date(),
          rejectedEvidence: this.collectRejectedEvidence(candidate),
        },
      });

      await tx.auditLog.create({
        data: {
          staffActorId: reviewerId,
          action: 'RIDER_REJECTED',
          permission: 'kyc.review',
          entity: 'RiderProfile',
          entityId: String(riderId),
          changes: { reason: reason ?? null },
        },
      });

      return rider;
    });
    await this.notifyRiderDecision(rider.userId, rider.id, 'REJECTED', reason);
    return rider;
  }

  async decideRiderApplication(
    riderId: number,
    reviewerId: number,
    decision: 'APPROVE' | 'REJECT',
    reason: string,
    approvePendingManualChecks = false,
  ) {
    const rider = await this.prisma.$transaction(async (tx) => {
      const initial = await tx.riderProfile.findUnique({
        where: { id: riderId },
        include: {
          documents: true,
          licences: true,
          liveness: true,
          vehicles: { include: { documents: true } },
          bankAccounts: true,
        },
      });
      if (!initial) throw new NotFoundException('Rider profile not found.');
      if (initial.onboardingStatus !== 'UNDER_REVIEW') {
        throw new BadRequestException('Only riders under review can receive a final decision.');
      }

      if (decision === 'REJECT') {
        const rejected = await tx.riderProfile.update({
          where: { id: riderId },
          data: {
            onboardingStatus: 'REJECTED',
            rejectionReason: reason,
            rejectedAt: new Date(),
            rejectedEvidence: this.collectRejectedEvidence(initial),
          },
        });
        await tx.auditLog.create({
          data: {
            staffActorId: reviewerId,
            action: 'RIDER_APPLICATION_REJECTED',
            permission: 'kyc.review',
            entity: 'RiderProfile',
            entityId: String(riderId),
            changes: { reason },
          },
        });
        return rejected;
      }

      if (approvePendingManualChecks) {
        const vehicles = initial.vehicles.filter(
          (vehicle) => vehicle.status === 'PENDING' && Boolean(vehicle.photoUrl),
        );
        const registrations = initial.vehicles.flatMap((vehicle) =>
          vehicle.documents.filter(
            (document) => document.type === 'VEHICLE_REGISTRATION' && document.status === 'PENDING',
          ),
        );
        if (vehicles.length) {
          await tx.vehicle.updateMany({
            where: { id: { in: vehicles.map((vehicle) => vehicle.id) } },
            data: { status: 'APPROVED' },
          });
        }
        if (registrations.length) {
          await tx.vehicleDocument.updateMany({
            where: { id: { in: registrations.map((document) => document.id) } },
            data: { status: 'APPROVED', reviewedById: reviewerId, reviewedAt: new Date() },
          });
        }
        for (const vehicle of vehicles) {
          await tx.auditLog.create({
            data: {
              staffActorId: reviewerId,
              action: 'KYC_APPROVED',
              permission: 'kyc.review',
              entity: 'Vehicle',
              entityId: String(vehicle.id),
              changes: { status: 'APPROVED', reason, reviewScope: 'MOTORCYCLE_PHOTO_AND_PLATE' },
            },
          });
        }
        for (const document of registrations) {
          await tx.auditLog.create({
            data: {
              staffActorId: reviewerId,
              action: 'KYC_APPROVED',
              permission: 'kyc.review',
              entity: 'VehicleDocument',
              entityId: String(document.id),
              changes: { status: 'APPROVED', reason },
            },
          });
        }
      }

      const candidate = await tx.riderProfile.findUniqueOrThrow({
        where: { id: riderId },
        include: {
          documents: true,
          licences: true,
          liveness: true,
          vehicles: { include: { documents: true } },
          bankAccounts: true,
        },
      });
      const readiness = assessRiderReadiness(candidate);
      if (readiness.missingOperationalRequirements.length) {
        throw new BadRequestException({
          message:
            'Rider cannot be approved. Automatic checks are incomplete or manual evidence was not approved.',
          missingRequirements: readiness.missingOperationalRequirements,
        });
      }

      const rider = await tx.riderProfile.update({
        where: { id: riderId },
        data: {
          onboardingStatus: 'APPROVED',
          rejectionReason: null,
          rejectedAt: null,
          rejectedEvidence: Prisma.DbNull,
        },
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
          staffActorId: reviewerId,
          action: 'RIDER_APPLICATION_APPROVED',
          permission: 'kyc.review',
          entity: 'RiderProfile',
          entityId: String(riderId),
          changes: { reason, approvePendingManualChecks },
        },
      });
      return rider;
    });
    await this.notifyRiderDecision(
      rider.userId,
      rider.id,
      decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      reason,
    );
    return rider;
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

    const updated = await this.prisma.riderDocument.update({
      where: { id: documentId },
      data: {
        status,
        rejectionReason: status === 'REJECTED' ? reason : null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
    await this.recordKycReview(reviewerId, 'RiderDocument', documentId, status, reason);
    return updated;
  }

  async reviewRiderLicence(
    licenceId: number,
    reviewerId: number,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const licence = await this.prisma.riderLicence.findUnique({ where: { id: licenceId } });
    if (!licence) throw new NotFoundException('Rider licence not found.');
    if (status === 'APPROVED' && licence.provider && licence.providerStatus !== 'VERIFIED') {
      throw new BadRequestException(
        'An automatic provider failure or pending result cannot be manually approved.',
      );
    }
    const updated = await this.prisma.riderLicence.update({
      where: { id: licenceId },
      data: { status },
    });
    await this.recordKycReview(reviewerId, 'RiderLicence', licenceId, status, reason);
    return updated;
  }

  async reviewVehicleDocument(
    documentId: number,
    reviewerId: number,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const document = await this.prisma.vehicleDocument.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Vehicle document not found.');
    const updated = await this.prisma.vehicleDocument.update({
      where: { id: documentId },
      data: {
        status,
        rejectionReason: status === 'REJECTED' ? reason : null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
    await this.recordKycReview(reviewerId, 'VehicleDocument', documentId, status, reason);
    return updated;
  }

  async reviewVehicle(
    vehicleId: number,
    reviewerId: number,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const vehicle = await this.prisma.vehicle.findUnique({ where: { id: vehicleId } });
    if (!vehicle) throw new NotFoundException('Rider motorcycle/vehicle not found.');
    const updated = await this.prisma.vehicle.update({
      where: { id: vehicleId },
      data: { status },
    });
    await this.recordKycReview(reviewerId, 'Vehicle', vehicleId, status, reason);
    return updated;
  }

  async reviewLiveness(
    livenessId: number,
    reviewerId: number,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const record = await this.prisma.riderLivenessVerification.findUnique({
      where: { id: livenessId },
    });
    if (!record) throw new NotFoundException('Rider liveness record not found.');
    const updated = await this.prisma.riderLivenessVerification.update({
      where: { id: livenessId },
      data: { status, verifiedAt: status === 'APPROVED' ? new Date() : null },
    });
    await this.recordKycReview(reviewerId, 'RiderLivenessVerification', livenessId, status, reason);
    return updated;
  }

  async reviewGuarantorDocument(
    documentId: number,
    reviewerId: number,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const document = await this.prisma.guarantorDocument.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new NotFoundException('Guarantor document not found.');
    const updated = await this.prisma.guarantorDocument.update({
      where: { id: documentId },
      data: {
        status,
        rejectionReason: status === 'REJECTED' ? reason : null,
        reviewedById: reviewerId,
        reviewedAt: new Date(),
      },
    });
    await this.recordKycReview(reviewerId, 'GuarantorDocument', documentId, status, reason);
    return updated;
  }

  private recordKycReview(
    reviewerId: number,
    entity: string,
    entityId: number,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        staffActorId: reviewerId,
        action: `KYC_${status}`,
        permission: 'kyc.review',
        entity,
        entityId: String(entityId),
        changes: { status, reason: reason ?? null },
      },
    });
  }

  private notifyRiderDecision(
    userId: number,
    riderId: number,
    status: 'APPROVED' | 'REJECTED',
    reason?: string,
  ) {
    const approved = status === 'APPROVED';
    return this.notifications.notifyUser({
      userId,
      type: 'KYC_UPDATE',
      priority: 'HIGH',
      title: approved ? 'Rider application approved' : 'Rider application not approved',
      message: approved
        ? 'Your rider application has been approved. You can now accept delivery requests.'
        : reason
          ? `Your rider application was not approved. Reason: ${reason}`
          : 'Your rider application was not approved. Open the rider app to review the next steps.',
      data: { riderId, status, reason: reason ?? null },
      templateKey: 'riderApplicationDecision',
      templateData: { status, reason },
    });
  }

  private collectRejectedEvidence(profile: {
    documents: Array<{ id: number; status: string }>;
    licences: Array<{ id: number; status: string }>;
    liveness: Array<{ id: number; status: string }>;
    vehicles: Array<{
      id: number;
      status: string;
      documents: Array<{ id: number; status: string }>;
    }>;
  }): Prisma.InputJsonValue {
    return [
      ...profile.documents
        .filter((item) => item.status === 'REJECTED')
        .map((item) => ({ type: 'RIDER_DOCUMENT', id: item.id })),
      ...profile.licences
        .filter((item) => item.status === 'REJECTED')
        .map((item) => ({ type: 'DRIVER_LICENSE', id: item.id })),
      ...profile.liveness
        .filter((item) => item.status === 'REJECTED')
        .map((item) => ({ type: 'LIVENESS', id: item.id })),
      ...profile.vehicles
        .filter((item) => item.status === 'REJECTED')
        .map((item) => ({ type: 'MOTORCYCLE', id: item.id })),
      ...profile.vehicles.flatMap((vehicle) =>
        vehicle.documents
          .filter((item) => item.status === 'REJECTED')
          .map((item) => ({ type: 'VEHICLE_DOCUMENT', id: item.id })),
      ),
    ];
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
          staffActorId: reviewerId,
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
      message:
        'Congratulations! Your vendor application has been approved. You can now set up your store.',
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
          staffActorId: reviewerId,
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
