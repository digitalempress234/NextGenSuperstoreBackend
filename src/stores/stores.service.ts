import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto, UpdateStoreDto, UpsertStoreProductDto } from './dto/store.dto';
import { StoreCampaignDto, StoreOrderQueryDto } from './dto/store-operations.dto';
import { UpdateStoreOperatingHoursDto } from './dto/store-operating-hours.dto';
import { StoreAvailabilityService } from './store-availability.service';

@Injectable()
export class StoresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: StoreAvailabilityService = new StoreAvailabilityService(),
  ) {}

  private paginated<T>(items: T[], total: number, page: number, limit: number) {
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  list() {
    return this.prisma.store.findMany({
      where: { isActive: true },
      include: { category: true, images: { orderBy: { sortOrder: 'asc' } } },
      orderBy: { storeName: 'asc' },
    });
  }

  mine(userId: number) {
    return this.prisma.store.findMany({
      where: { OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        products: {
          include: {
            product: { include: { images: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async assertAccess(userId: number, storeId: number) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, OR: [{ ownerUserId: userId }, { members: { some: { userId } } }] },
    });
    if (!store) throw new ForbiddenException('You do not have access to this store.');
    return store;
  }

  async orders(userId: number, storeId: number, query: StoreOrderQueryDto) {
    await this.assertAccess(userId, storeId);
    const where = { storeId, currentStatus: query.status as OrderStatus };
    if (!query.status) delete (where as { currentStatus?: unknown }).currentStatus;
    const [items, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: { items: true, delivery: true, pickup: true, payment: true },
        orderBy: { placedAt: 'desc' },
        skip: (query.page - 1) * Math.min(query.limit, 15),
        take: Math.min(query.limit, 15),
      }),
      this.prisma.order.count({ where }),
    ]);
    return {
      items,
      total,
      page: query.page,
      limit: Math.min(query.limit, 15),
      pages: Math.ceil(total / Math.min(query.limit, 15)),
    };
  }

  async order(userId: number, storeId: number, orderId: number) {
    await this.assertAccess(userId, storeId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, storeId },
      include: {
        items: true,
        delivery: true,
        pickup: true,
        payment: true,
        statusHistory: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Order not found.');
    return order;
  }

  async campaigns(userId: number, storeId: number, page = 1, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    await this.assertAccess(userId, storeId);
    const where = { storeId };
    const [items, total] = await Promise.all([
      this.prisma.rewardVoucher.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.rewardVoucher.count({ where }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  async createCampaign(userId: number, storeId: number, dto: StoreCampaignDto) {
    await this.assertAccess(userId, storeId);
    return this.prisma.rewardVoucher.create({
      data: {
        ...dto,
        code: dto.code.trim().toUpperCase(),
        storeId,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async updateCampaign(userId: number, storeId: number, campaignId: string, dto: StoreCampaignDto) {
    await this.assertAccess(userId, storeId);
    const existing = await this.prisma.rewardVoucher.findFirst({
      where: { id: campaignId, storeId },
    });
    if (!existing) throw new NotFoundException('Campaign not found.');
    return this.prisma.rewardVoucher.update({
      where: { id: campaignId },
      data: {
        ...dto,
        code: dto.code.trim().toUpperCase(),
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });
  }

  async inbox(userId: number, storeId: number, page = 1, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    await this.assertAccess(userId, storeId);
    const where = { storeId };
    const [items, total] = await Promise.all([
      this.prisma.chatConversation.findMany({
        where,
        include: {
          participant: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } },
          order: { select: { id: true, orderNumber: true } },
          messages: { take: 1, orderBy: { createdAt: 'desc' } },
        },
        orderBy: { lastMessageAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.chatConversation.count({ where }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  async riders(userId: number, storeId: number, page = 1, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    await this.assertAccess(userId, storeId);
    const where = { user: { riderDeliveries: { some: { order: { storeId } } } } };
    const [items, total] = await Promise.all([
      this.prisma.riderProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phoneNumber: true,
              avatarUrl: true,
            },
          },
          vehicles: true,
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.riderProfile.count({ where }),
    ]);
    return this.paginated(items, total, page, limit);
  }

  async compareDeals(userId: number, storeId: number, page = 1, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    await this.assertAccess(userId, storeId);
    const where = { storeId, isActive: true };
    const [offers, total] = await Promise.all([
      this.prisma.storeProduct.findMany({
        where,
        include: {
          product: {
            include: {
              offers: {
                where: { isActive: true, availability: true },
                include: { store: { select: { id: true, storeName: true } } },
                orderBy: { price: 'asc' },
              },
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.storeProduct.count({ where }),
    ]);
    const items = offers.map((offer) => ({
      storeOffer: offer,
      competingOffers: offer.product.offers.filter((item) => item.storeId !== storeId),
    }));
    return this.paginated(items, total, page, limit);
  }

  async settings(userId: number, storeId: number) {
    await this.assertAccess(userId, storeId);
    return this.prisma.store.findUnique({
      where: { id: storeId },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        operatingHours: { orderBy: { dayOfWeek: 'asc' } },
      },
    });
  }

  async operatingHours(userId: number, storeId: number) {
    await this.assertAccess(userId, storeId);
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      include: { operatingHours: { orderBy: { dayOfWeek: 'asc' } } },
    });
    return this.operatingHoursResponse(store);
  }

  async updateOperatingHours(userId: number, storeId: number, dto: UpdateStoreOperatingHoursDto) {
    await this.assertAccess(userId, storeId);
    const uniqueDays = new Set(dto.hours.map((hour) => hour.dayOfWeek));
    if (uniqueDays.size !== dto.hours.length)
      throw new BadRequestException('Only one operating-hours entry is allowed per day.');
    if (dto.timezone) {
      try {
        new Intl.DateTimeFormat('en-US', { timeZone: dto.timezone }).format();
      } catch {
        throw new BadRequestException('timezone must be a valid IANA timezone.');
      }
    }
    for (const hour of dto.hours) {
      if (!hour.isClosed && (!hour.opensAt || !hour.closesAt))
        throw new BadRequestException('Open days require opensAt and closesAt.');
    }
    const store = await this.prisma.$transaction(async (tx) => {
      await tx.storeOperatingHour.deleteMany({ where: { storeId } });
      if (dto.hours.length) {
        await tx.storeOperatingHour.createMany({
          data: dto.hours.map((hour) => ({
            storeId,
            dayOfWeek: hour.dayOfWeek,
            opensMinute: hour.isClosed ? null : this.minuteOfDay(hour.opensAt!),
            closesMinute: hour.isClosed ? null : this.minuteOfDay(hour.closesAt!),
            isClosed: hour.isClosed,
          })),
        });
      }
      return tx.store.update({
        where: { id: storeId },
        data: {
          timezone: dto.timezone,
          temporarilyClosedUntil:
            dto.temporarilyClosedUntil === undefined
              ? undefined
              : dto.temporarilyClosedUntil
                ? new Date(dto.temporarilyClosedUntil)
                : null,
        },
        include: { operatingHours: { orderBy: { dayOfWeek: 'asc' } } },
      });
    });
    return this.operatingHoursResponse(store);
  }

  private operatingHoursResponse(
    store: Awaited<ReturnType<typeof this.prisma.store.findUniqueOrThrow>>,
  ) {
    const typed = store as typeof store & {
      operatingHours: Array<{
        dayOfWeek: number;
        opensMinute: number | null;
        closesMinute: number | null;
        isClosed: boolean;
      }>;
      timezone: string;
      temporarilyClosedUntil: Date | null;
      storeName: string;
      isActive: boolean;
    };
    return {
      timezone: typed.timezone,
      temporarilyClosedUntil: typed.temporarilyClosedUntil,
      acceptsScheduledOrders: false,
      availability: this.availability.evaluate(typed),
      hours: typed.operatingHours.map((hour) => ({
        dayOfWeek: hour.dayOfWeek,
        opensAt: hour.opensMinute === null ? null : this.formatMinute(hour.opensMinute),
        closesAt: hour.closesMinute === null ? null : this.formatMinute(hour.closesMinute),
        isClosed: hour.isClosed,
      })),
    };
  }

  private minuteOfDay(value: string) {
    const [hour, minute] = value.split(':').map(Number);
    return hour * 60 + minute;
  }

  private formatMinute(value: number) {
    return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  }

  async overview(userId: number, storeId: number) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, ownerUserId: userId },
    });

    if (!store) {
      throw new ForbiddenException('You do not have access to this store.');
    }

    const [totalOrders, pendingOrders, totalRevenueResult, totalProducts] = await Promise.all([
      this.prisma.order.count({ where: { storeId } }),
      this.prisma.order.count({
        where: { storeId, currentStatus: { in: ['ORDER_RECEIVED', 'CONFIRMED'] } },
      }),
      this.prisma.order.aggregate({
        _sum: { total: true },
        where: { storeId, currentStatus: { in: ['DELIVERED', 'COMPLETED'] } },
      }),
      this.prisma.storeProduct.count({ where: { storeId, isActive: true } }),
    ]);

    return {
      totalOrders,
      pendingOrders,
      totalRevenue: totalRevenueResult._sum.total ? Number(totalRevenueResult._sum.total) : 0,
      totalProducts,
    };
  }

  create(userId: number, body: CreateStoreDto) {
    return this.prisma.store.create({
      data: {
        ownerUserId: userId,
        storeName: body.storeName,
        description: body.description,
        email: body.email,
        phone: body.phone,
        state: body.state,
        city: body.city,
        address: body.address,
        categoryId: body.categoryId,
        imageUrl: body.imageUrl,
      },
    });
  }

  async addProduct(userId: number, storeId: number, body: UpsertStoreProductDto) {
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        ownerUserId: userId,
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found.');
    }

    if (!store.isActive) {
      throw new ForbiddenException(
        'Store approval is required before products can be added or updated.',
      );
    }

    const product = await this.prisma.product.findUnique({
      where: { id: body.productId },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return this.prisma.storeProduct.upsert({
      where: {
        storeId_productId: {
          storeId,
          productId: body.productId,
        },
      },
      create: {
        storeId,
        productId: body.productId,
        sku: body.sku,
        barcode: body.barcode?.trim().toUpperCase(),
        barcodeFormat: body.barcodeFormat,
        price: body.price,
        discountPrice: body.discountPrice,
        discountType: body.discountType,
        stockQuantity: body.stockQuantity,
      },
      update: {
        sku: body.sku,
        barcode: body.barcode?.trim().toUpperCase(),
        barcodeFormat: body.barcodeFormat,
        price: body.price,
        discountPrice: body.discountPrice,
        discountType: body.discountType,
        stockQuantity: body.stockQuantity,
      },
    });
  }
  async update(userId: number, storeId: number, body: UpdateStoreDto) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, ownerUserId: userId },
    });

    if (!store) {
      throw new ForbiddenException('You do not have access to this store.');
    }

    return this.prisma.store.update({
      where: { id: storeId },
      data: {
        storeName: body.storeName,
        description: body.description,
        email: body.email,
        phone: body.phone,
        state: body.state,
        city: body.city,
        address: body.address,
        categoryId: body.categoryId,
        imageUrl: body.imageUrl,
        latitude: body.latitude,
        longitude: body.longitude,
      },
    });
  }
}
