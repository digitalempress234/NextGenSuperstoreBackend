import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DeliveryStatus, Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';
import { SettlementsService } from '../settlements/settlements.service';
import { canTransitionOrder } from '../orders/order-status';
import { assessRiderReadiness } from '../riders/rider-readiness';

const riderReadinessInclude = {
  user: { select: { status: true } },
  documents: true,
  licences: true,
  liveness: true,
  vehicles: { include: { documents: true } },
  bankAccounts: true,
} satisfies Prisma.RiderProfileInclude;

const allowedTransitions: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ['OFFERED', 'ASSIGNED', 'CANCELLED'],
  OFFERED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT', 'OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER', 'FAILED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'ARRIVED_AT_CUSTOMER', 'DELIVERED', 'FAILED'],
  OUT_FOR_DELIVERY: ['ARRIVED_AT_CUSTOMER', 'DELIVERED', 'FAILED'],
  ARRIVED_AT_CUSTOMER: ['DELIVERED', 'FAILED'],
  DELIVERED: [],
  FAILED: [],
  CANCELLED: [],
};

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly trackingGateway: DeliveryTrackingGateway,
    private readonly settlements: SettlementsService,
  ) {}

  myDeliveries(riderId: number) {
    return this.prisma.delivery.findMany({
      where: { riderId },
      include: {
        order: {
          include: {
            store: true,
            items: true,
          },
        },
        statusUpdates: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async overview(riderId: number) {
    const [totalDeliveries, completedDeliveries, failedDeliveries, pendingDeliveries] =
      await Promise.all([
        this.prisma.delivery.count({ where: { riderId } }),
        this.prisma.delivery.count({ where: { riderId, status: 'DELIVERED' } }),
        this.prisma.delivery.count({ where: { riderId, status: { in: ['FAILED', 'CANCELLED'] } } }),
        this.prisma.delivery.count({
          where: { riderId, status: { notIn: ['DELIVERED', 'FAILED', 'CANCELLED'] } },
        }),
      ]);

    return {
      totalDeliveries,
      completedDeliveries,
      failedDeliveries,
      pendingDeliveries,
    };
  }

  offers(riderId: number) {
    return this.prisma.deliveryOffer.findMany({
      where: {
        riderId,
        status: 'PENDING',
      },
      include: {
        delivery: {
          include: {
            order: {
              include: { store: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async available(riderId: number, page = 1, limit = 15) {
    const rider = await this.requireEligibleRider(this.prisma, riderId, true);
    const riderLocation = this.requireFreshJobLocation(rider);
    const radiusKm = this.jobRadiusKm();
    const latitudeDelta = radiusKm / 111;
    const longitudeDelta =
      radiusKm / Math.max(111 * Math.cos((riderLocation.latitude * Math.PI) / 180), 1);
    const where: Prisma.DeliveryWhereInput = {
      riderId: null,
      status: { in: ['PENDING', 'OFFERED'] },
      order: {
        currentStatus: 'READY_FOR_PICKUP',
        OR: [
          { store: { latitude: null } },
          { store: { longitude: null } },
          {
            store: {
              latitude: {
                gte: riderLocation.latitude - latitudeDelta,
                lte: riderLocation.latitude + latitudeDelta,
              },
              longitude: {
                gte: riderLocation.longitude - longitudeDelta,
                lte: riderLocation.longitude + longitudeDelta,
              },
            },
          },
        ],
      },
    };
    const deliveries = await this.prisma.delivery.findMany({
      where,
      select: {
        id: true,
        orderId: true,
        status: true,
        deliveryCity: true,
        deliveryState: true,
        createdAt: true,
        order: {
          select: {
            orderNumber: true,
            shippingFee: true,
            currency: true,
            store: {
              select: {
                id: true,
                storeName: true,
                address: true,
                city: true,
                state: true,
                latitude: true,
                longitude: true,
              },
            },
            _count: { select: { items: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const matched = deliveries
      .filter((delivery) => this.matchesServiceArea(rider, delivery))
      .map((delivery) => {
        const storeLocation = this.coordinates(
          delivery.order.store.latitude,
          delivery.order.store.longitude,
        );
        const distanceKm = storeLocation ? this.distanceKm(riderLocation, storeLocation) : null;
        return { delivery, distanceKm };
      })
      .filter(({ distanceKm }) => distanceKm == null || distanceKm <= radiusKm)
      .sort((left, right) => {
        if (left.distanceKm == null) return right.distanceKm == null ? 0 : 1;
        if (right.distanceKm == null) return -1;
        return left.distanceKm - right.distanceKm;
      });
    const total = matched.length;
    const pageItems = matched.slice((page - 1) * limit, page * limit);

    return {
      items: pageItems.map(({ delivery, distanceKm }) => ({
        id: delivery.id,
        orderId: delivery.orderId,
        orderNumber: delivery.order.orderNumber,
        status: delivery.status,
        pickup: {
          storeId: delivery.order.store.id,
          storeName: delivery.order.store.storeName,
          address: delivery.order.store.address,
          city: delivery.order.store.city,
          state: delivery.order.store.state,
          latitude: delivery.order.store.latitude,
          longitude: delivery.order.store.longitude,
        },
        destination: { city: delivery.deliveryCity, state: delivery.deliveryState },
        deliveryFee: delivery.order.shippingFee,
        currency: delivery.order.currency,
        itemCount: delivery.order._count.items,
        distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(2)),
        matchingMode: distanceKm == null ? 'SERVICE_AREA_FALLBACK' : 'LIVE_GPS',
        createdAt: delivery.createdAt,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        radiusKm,
        riderLocationUpdatedAt: rider.locationUpdatedAt,
      },
    };
  }

  async notifyAvailableRidersForOrder(orderId: number) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { orderId },
      include: { order: { include: { store: true } } },
    });
    if (
      !delivery ||
      delivery.riderId != null ||
      !['PENDING', 'OFFERED'].includes(delivery.status) ||
      delivery.order.currentStatus !== 'READY_FOR_PICKUP'
    ) {
      return { matched: 0, notified: 0 };
    }

    const maxAgeMs = this.positiveSetting('RIDER_LOCATION_MAX_AGE_SECONDS', 120) * 1000;
    const riders = await this.prisma.riderProfile.findMany({
      where: {
        onboardingStatus: 'APPROVED',
        isOnline: true,
        currentLatitude: { not: null },
        currentLongitude: { not: null },
        locationUpdatedAt: { gte: new Date(Date.now() - maxAgeMs) },
        user: { status: 'ACTIVE' },
      },
      include: riderReadinessInclude,
      take: 250,
    });
    const storeLocation = this.coordinates(
      delivery.order.store.latitude,
      delivery.order.store.longitude,
    );
    const radiusKm = this.jobRadiusKm();
    const matched = riders.flatMap((rider) => {
      if (!assessRiderReadiness(rider).canAcceptDeliveries) return [];
      try {
        if (!this.matchesServiceArea(rider, delivery)) return [];
        const riderLocation = this.requireFreshJobLocation(rider);
        const distanceKm = storeLocation ? this.distanceKm(riderLocation, storeLocation) : null;
        if (distanceKm != null && distanceKm > radiusKm) return [];
        return [{ rider, distanceKm }];
      } catch {
        return [];
      }
    });

    const outcomes = await Promise.allSettled(
      matched.map(({ rider, distanceKm }) =>
        this.notifications.notifyUser({
          userId: rider.userId,
          type: 'DELIVERY_AVAILABLE',
          title: 'New delivery available',
          message: `A pickup is available near ${delivery.order.store.city}, ${delivery.order.store.state}.`,
          data: {
            deliveryId: delivery.id,
            orderId: delivery.orderId,
            storeId: delivery.order.store.id,
            distanceKm: distanceKm == null ? null : Number(distanceKm.toFixed(2)),
          },
          eventKey: `delivery-available:${delivery.id}:${rider.userId}`,
        }),
      ),
    );
    return {
      matched: matched.length,
      notified: outcomes.filter((result) => result.status === 'fulfilled').length,
    };
  }

  claim(riderId: number, deliveryId: number) {
    return this.claimDelivery(riderId, deliveryId);
  }

  async accept(riderId: number, offerId: number) {
    const offer = await this.prisma.deliveryOffer.findFirst({
      where: {
        id: offerId,
        riderId,
        status: 'PENDING',
      },
      include: { delivery: { include: { order: true } } },
    });

    if (!offer) {
      throw new NotFoundException('Delivery offer not found.');
    }

    return this.claimDelivery(riderId, offer.deliveryId, offerId);
  }

  private async claimDelivery(riderId: number, deliveryId: number, offerId?: number) {
    const delivery = await this.prisma.$transaction(async (tx) => {
      const rider = await this.requireEligibleRider(tx, riderId, true);
      const current = await tx.delivery.findUnique({
        where: { id: deliveryId },
        include: { order: { include: { store: true } } },
      });
      if (!current) throw new NotFoundException('Delivery job was not found.');
      if (current.riderId || !['PENDING', 'OFFERED'].includes(current.status)) {
        throw new ConflictException('Delivery has already been claimed.');
      }
      if (current.order.currentStatus !== 'READY_FOR_PICKUP') {
        throw new BadRequestException('The order is not ready for rider pickup.');
      }
      if (!this.matchesServiceArea(rider, current)) {
        throw new ForbiddenException('Delivery is outside your approved service area.');
      }
      const riderLocation = this.requireFreshJobLocation(rider);
      const storeLocation = this.coordinates(
        current.order.store.latitude,
        current.order.store.longitude,
      );
      if (storeLocation) {
        const distanceKm = this.distanceKm(riderLocation, storeLocation);
        if (distanceKm > this.jobRadiusKm()) {
          throw new ForbiddenException(
            `Store is ${distanceKm.toFixed(2)} km away, outside the rider job radius.`,
          );
        }
      }

      const assigned = await tx.delivery.updateMany({
        where: { id: deliveryId, riderId: null, status: { in: ['PENDING', 'OFFERED'] } },
        data: { riderId, status: 'ASSIGNED', assignedAt: new Date() },
      });
      if (assigned.count !== 1) throw new ConflictException('Delivery has already been claimed.');

      const orderUpdated = await tx.order.updateMany({
        where: { id: current.orderId, currentStatus: 'READY_FOR_PICKUP' },
        data: { currentStatus: 'RIDER_ASSIGNED' },
      });
      if (orderUpdated.count !== 1) {
        throw new ConflictException('Order is no longer available for rider assignment.');
      }

      if (offerId) {
        await tx.deliveryOffer.update({ where: { id: offerId }, data: { status: 'ACCEPTED' } });
      } else {
        await tx.deliveryOffer.upsert({
          where: { deliveryId_riderId: { deliveryId, riderId } },
          create: { deliveryId, riderId, status: 'ACCEPTED' },
          update: { status: 'ACCEPTED' },
        });
      }
      await tx.deliveryOffer.updateMany({
        where: {
          deliveryId,
          riderId: { not: riderId },
          status: 'PENDING',
        },
        data: { status: 'EXPIRED' },
      });
      await tx.orderStatusHistory.create({
        data: {
          orderId: current.orderId,
          fromStatus: current.order.currentStatus,
          toStatus: 'RIDER_ASSIGNED',
          changedById: riderId,
          reason: 'Rider claimed the available delivery job.',
        },
      });
      await this.settlements.holdRiderEarning(deliveryId, tx);

      return tx.delivery.findUniqueOrThrow({
        where: { id: deliveryId },
        include: { order: { include: { store: true, items: true } } },
      });
    });

    this.trackingGateway.broadcastJobClaimed({
      deliveryId: delivery.id,
      orderId: delivery.orderId,
      claimedAt: new Date().toISOString(),
    });

    await this.notifications.notifyUser({
      userId: delivery.order.userId,
      type: 'DELIVERY_ASSIGNED',
      title: 'Rider assigned',
      message: `A rider has been assigned to order ${delivery.order.orderNumber}.`,
      data: { deliveryId: delivery.id, orderId: delivery.orderId },
      templateKey: 'deliveryAssigned',
      templateData: { orderNumber: delivery.order.orderNumber, riderName: `Rider #${riderId}` },
    });

    return delivery;
  }

  private async requireEligibleRider(
    client: PrismaService | Prisma.TransactionClient,
    riderId: number,
    requireOnline: boolean,
  ) {
    const profile = await client.riderProfile.findUnique({
      where: { userId: riderId },
      include: riderReadinessInclude,
    });
    if (!profile) throw new ForbiddenException('A rider profile is required.');
    if (profile.user.status !== 'ACTIVE')
      throw new ForbiddenException('Rider account is inactive.');
    const readiness = assessRiderReadiness(profile);
    if (!readiness.canAcceptDeliveries) {
      throw new ForbiddenException({
        message: 'Rider operational approval is required.',
        missingOperationalRequirements: readiness.missingOperationalRequirements,
      });
    }
    if (requireOnline && !profile.isOnline) {
      throw new ForbiddenException('Go online before browsing or claiming delivery jobs.');
    }
    return profile;
  }

  private positiveSetting(name: string, fallback: number) {
    const value = Number(process.env[name]);
    return Number.isFinite(value) && value > 0 ? value : fallback;
  }

  private jobRadiusKm() {
    return this.positiveSetting('RIDER_JOB_RADIUS_KM', 10);
  }

  private requireFreshJobLocation(rider: {
    currentLatitude: Prisma.Decimal | null;
    currentLongitude: Prisma.Decimal | null;
    locationAccuracyM: Prisma.Decimal | null;
    locationUpdatedAt: Date | null;
  }) {
    const coordinates = this.coordinates(rider.currentLatitude, rider.currentLongitude);
    if (!coordinates || !rider.locationUpdatedAt) {
      throw new ForbiddenException('Publish your current GPS location before requesting jobs.');
    }
    const maxAgeMs = this.positiveSetting('RIDER_LOCATION_MAX_AGE_SECONDS', 120) * 1000;
    if (Date.now() - rider.locationUpdatedAt.getTime() > maxAgeMs) {
      throw new ForbiddenException('Your GPS location is stale. Update it before requesting jobs.');
    }
    const accuracyM = rider.locationAccuracyM == null ? null : Number(rider.locationAccuracyM);
    if (
      accuracyM != null &&
      accuracyM > this.positiveSetting('RIDER_LOCATION_MAX_ACCURACY_M', 500)
    ) {
      throw new ForbiddenException('GPS accuracy is too low. Acquire a better location fix.');
    }
    return coordinates;
  }

  private coordinates(
    latitude: Prisma.Decimal | number | null,
    longitude: Prisma.Decimal | number | null,
  ) {
    if (latitude == null || longitude == null) return null;
    const result = { latitude: Number(latitude), longitude: Number(longitude) };
    return Number.isFinite(result.latitude) && Number.isFinite(result.longitude) ? result : null;
  }

  private distanceKm(
    first: { latitude: number; longitude: number },
    second: { latitude: number; longitude: number },
  ) {
    const radians = (degrees: number) => (degrees * Math.PI) / 180;
    const latitudeDelta = radians(second.latitude - first.latitude);
    const longitudeDelta = radians(second.longitude - first.longitude);
    const a =
      Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(first.latitude)) *
        Math.cos(radians(second.latitude)) *
        Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  private areaTerms(rider: { areaOfOperation: string | null }) {
    return [
      ...new Set(
        (rider.areaOfOperation?.split(/[,/|]/) ?? [])
          .map((value) => value.trim())
          .filter((value) => value.length >= 2),
      ),
    ];
  }

  private matchesServiceArea(
    rider: {
      areaOfOperation: string | null;
    },
    delivery: {
      deliveryCity: string | null;
      deliveryState: string | null;
      order: { store: { city: string; state: string } };
    },
  ) {
    const destination = [delivery.deliveryCity, delivery.deliveryState]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLocaleLowerCase());
    const pickup = [delivery.order.store.city, delivery.order.store.state].map((value) =>
      value.toLocaleLowerCase(),
    );
    const terms = this.areaTerms(rider).map((term) => term.toLocaleLowerCase());
    if (!terms.length) {
      throw new ForbiddenException('Set your rider service area before going online.');
    }
    const matches = (locations: string[]) =>
      terms.some((term) =>
        locations.some((location) => location.includes(term) || term.includes(location)),
      );
    return matches(destination) && matches(pickup);
  }

  async updateStatus(
    riderId: number,
    deliveryId: number,
    status: DeliveryStatus,
    location?: string,
    note?: string,
  ) {
    const delivery = await this.prisma.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: true },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery not found.');
    }

    if (delivery.riderId !== riderId) {
      throw new ForbiddenException('You are not assigned to this delivery.');
    }

    if (!allowedTransitions[delivery.status].includes(status)) {
      throw new BadRequestException(`Invalid delivery transition: ${delivery.status} -> ${status}`);
    }

    if (status === 'PICKED_UP' || status === 'DELIVERED') {
      throw new BadRequestException(
        status === 'PICKED_UP'
          ? 'Confirm pickup with the store handoff QR instead of setting PICKED_UP directly.'
          : 'Confirm delivery with the customer QR instead of setting DELIVERED directly.',
      );
    }

    const synchronizedOrderStatus =
      status === 'IN_TRANSIT' || status === 'OUT_FOR_DELIVERY' || status === 'ARRIVED_AT_CUSTOMER'
        ? 'OUT_FOR_DELIVERY'
        : null;
    if (
      synchronizedOrderStatus &&
      delivery.order.currentStatus !== synchronizedOrderStatus &&
      !canTransitionOrder(delivery.order.currentStatus, synchronizedOrderStatus)
    ) {
      throw new BadRequestException(
        `Order ${delivery.orderId} cannot move from ${delivery.order.currentStatus} to ${synchronizedOrderStatus}.`,
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          status,
          ...(status === 'ARRIVED_AT_CUSTOMER' ? { arrivedAt: new Date() } : {}),
        },
      });

      await tx.deliveryStatusUpdate.create({
        data: {
          deliveryId,
          status,
          location,
          note,
        },
      });

      if (synchronizedOrderStatus && delivery.order.currentStatus !== synchronizedOrderStatus) {
        await tx.order.update({
          where: { id: delivery.orderId },
          data: { currentStatus: synchronizedOrderStatus },
        });
        await tx.orderStatusHistory.create({
          data: {
            orderId: delivery.orderId,
            fromStatus: delivery.order.currentStatus,
            toStatus: synchronizedOrderStatus,
            changedById: riderId,
            reason: `Synchronized from rider delivery status ${status}.`,
          },
        });
      }

      return updated;
    });

    this.trackingGateway.broadcastStatus({
      deliveryId,
      status,
      occurredAt: new Date().toISOString(),
    });

    return updated;
  }
}
