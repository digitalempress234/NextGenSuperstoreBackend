import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MarketplacePromotionStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { PrismaService } from '../prisma/prisma.service';
import {
  CreateMarketplacePromotionDto,
  PromotionListQueryDto,
  PublicPromotionListQueryDto,
  ReviewMarketplacePromotionDto,
  UpdateMarketplacePromotionDto,
} from './dto/marketplace-promotion.dto';

const promotionInclude = Prisma.validator<Prisma.MarketplacePromotionInclude>()({
  store: {
    select: {
      id: true,
      storeName: true,
      city: true,
      state: true,
      imageUrl: true,
      isActive: true,
    },
  },
  products: {
    orderBy: { sortOrder: 'asc' },
    include: {
      storeProduct: {
        include: {
          product: { include: { images: { orderBy: { sortOrder: 'asc' }, take: 3 } } },
        },
      },
    },
  },
});

type PromotionRecord = Prisma.MarketplacePromotionGetPayload<{
  include: typeof promotionInclude;
}>;

@Injectable()
export class PromotionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, storeId: number, dto: CreateMarketplacePromotionDto) {
    await this.assertStoreAccess(userId, storeId);
    const productIds = dto.storeProductIds ?? [];
    await this.assertProducts(storeId, productIds);
    const fields = { ...dto };
    delete fields.storeProductIds;
    const dates = this.dates(fields.startsAt, fields.endsAt);

    return this.prisma.marketplacePromotion.create({
      data: {
        title: fields.title.trim(),
        slug: this.slug(fields.title),
        subtitle: fields.subtitle?.trim(),
        description: fields.description?.trim(),
        imageUrl: fields.imageUrl,
        deepLink: fields.deepLink,
        ctaLabel: fields.ctaLabel?.trim() || 'Shop now',
        badgeText: fields.badgeText?.trim(),
        type: fields.type,
        startsAt: dates.startsAt,
        endsAt: dates.endsAt,
        storeId,
        createdByUserId: userId,
        products: {
          create: productIds.map((storeProductId, sortOrder) => ({ storeProductId, sortOrder })),
        },
      },
      include: promotionInclude,
    });
  }

  async publicHome(limit = 8) {
    const items = await this.prisma.marketplacePromotion.findMany({
      where: this.publicWhere(),
      include: promotionInclude,
      orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(15, Math.max(1, limit)),
    });
    return items.map((item) => this.toPublic(item));
  }

  async publicList(query: PublicPromotionListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(15, Math.max(1, query.limit || 15));
    const where: Prisma.MarketplacePromotionWhereInput = {
      ...this.publicWhere(),
      ...(query.type ? { type: query.type } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search } },
              { subtitle: { contains: query.search } },
              { store: { storeName: { contains: query.search } } },
            ],
          }
        : {}),
    };
    const [records, total] = await Promise.all([
      this.prisma.marketplacePromotion.findMany({
        where,
        include: promotionInclude,
        orderBy: [{ startsAt: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.marketplacePromotion.count({ where }),
    ]);
    return {
      items: records.map((item) => this.toPublic(item)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async publicGet(slug: string) {
    const promotion = await this.prisma.marketplacePromotion.findFirst({
      where: { slug, ...this.publicWhere() },
      include: promotionInclude,
    });
    if (!promotion) throw new NotFoundException('Marketplace promotion not found.');
    return this.toPublic(promotion);
  }

  async listForStore(userId: number, storeId: number, query: PromotionListQueryDto) {
    await this.assertStoreAccess(userId, storeId, false);
    return this.list(
      {
        storeId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.search
          ? {
              OR: [{ title: { contains: query.search } }, { subtitle: { contains: query.search } }],
            }
          : {}),
      },
      query,
    );
  }

  async getForStore(userId: number, storeId: number, promotionId: number) {
    await this.assertStoreAccess(userId, storeId, false);
    const promotion = await this.prisma.marketplacePromotion.findFirst({
      where: { id: promotionId, storeId },
      include: promotionInclude,
    });
    if (!promotion) throw new NotFoundException('Marketplace promotion not found.');
    return promotion;
  }

  async update(
    userId: number,
    storeId: number,
    promotionId: number,
    dto: UpdateMarketplacePromotionDto,
  ) {
    await this.assertStoreAccess(userId, storeId);
    if (!Object.keys(dto).length) throw new BadRequestException('Supply at least one field.');
    const existing = await this.prisma.marketplacePromotion.findFirst({
      where: { id: promotionId, storeId },
    });
    if (!existing) throw new NotFoundException('Marketplace promotion not found.');
    if (existing.status === MarketplacePromotionStatus.ARCHIVED) {
      throw new ConflictException('An archived promotion cannot be edited.');
    }

    const productIds = dto.storeProductIds;
    if (productIds) await this.assertProducts(storeId, productIds);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    this.assertDateRange(startsAt, endsAt);
    const fields = { ...dto };
    delete fields.storeProductIds;

    return this.prisma.$transaction(async (tx) => {
      if (productIds) {
        await tx.marketplacePromotionProduct.deleteMany({ where: { promotionId } });
        if (productIds.length) {
          await tx.marketplacePromotionProduct.createMany({
            data: productIds.map((storeProductId, sortOrder) => ({
              promotionId,
              storeProductId,
              sortOrder,
            })),
          });
        }
      }
      return tx.marketplacePromotion.update({
        where: { id: promotionId },
        data: {
          ...(fields.title !== undefined ? { title: fields.title.trim() } : {}),
          ...(fields.subtitle !== undefined ? { subtitle: fields.subtitle.trim() } : {}),
          ...(fields.description !== undefined ? { description: fields.description.trim() } : {}),
          ...(fields.imageUrl !== undefined ? { imageUrl: fields.imageUrl } : {}),
          ...(fields.deepLink !== undefined ? { deepLink: fields.deepLink } : {}),
          ...(fields.ctaLabel !== undefined
            ? { ctaLabel: fields.ctaLabel.trim() || 'Shop now' }
            : {}),
          ...(fields.badgeText !== undefined ? { badgeText: fields.badgeText.trim() } : {}),
          ...(fields.type !== undefined ? { type: fields.type } : {}),
          startsAt,
          endsAt,
          status: MarketplacePromotionStatus.PENDING,
          rejectionReason: null,
          reviewedAt: null,
          reviewedById: null,
        },
        include: promotionInclude,
      });
    });
  }

  async archive(userId: number, storeId: number, promotionId: number) {
    await this.getForStore(userId, storeId, promotionId);
    return this.prisma.marketplacePromotion.update({
      where: { id: promotionId },
      data: { status: MarketplacePromotionStatus.ARCHIVED },
      include: promotionInclude,
    });
  }

  listForAdmin(query: PromotionListQueryDto) {
    return this.list(
      {
        ...(query.status ? { status: query.status } : {}),
        ...(query.type ? { type: query.type } : {}),
        ...(query.storeId ? { storeId: query.storeId } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search } },
                { subtitle: { contains: query.search } },
                { store: { storeName: { contains: query.search } } },
              ],
            }
          : {}),
      },
      query,
    );
  }

  async getForAdmin(promotionId: number) {
    const promotion = await this.prisma.marketplacePromotion.findUnique({
      where: { id: promotionId },
      include: promotionInclude,
    });
    if (!promotion) throw new NotFoundException('Marketplace promotion not found.');
    return promotion;
  }

  async review(staffUserId: number, promotionId: number, dto: ReviewMarketplacePromotionDto) {
    const promotion = await this.getForAdmin(promotionId);
    if (promotion.status === MarketplacePromotionStatus.ARCHIVED) {
      throw new ConflictException('An archived promotion cannot be reviewed.');
    }
    if (dto.decision === 'REJECTED' && !dto.reason?.trim()) {
      throw new BadRequestException('A rejection reason is required.');
    }
    const status =
      dto.decision === 'APPROVED'
        ? MarketplacePromotionStatus.APPROVED
        : MarketplacePromotionStatus.REJECTED;

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.marketplacePromotion.update({
        where: { id: promotionId },
        data: {
          status,
          rejectionReason: dto.decision === 'REJECTED' ? dto.reason?.trim() : null,
          reviewedAt: new Date(),
          reviewedById: staffUserId,
        },
        include: promotionInclude,
      });
      await tx.auditLog.create({
        data: {
          staffActorId: staffUserId,
          action: `MARKETPLACE_PROMOTION_${status}`,
          entity: 'MarketplacePromotion',
          entityId: String(promotionId),
          changes: { status, rejectionReason: updated.rejectionReason },
        },
      });
      return updated;
    });
  }

  private async list(where: Prisma.MarketplacePromotionWhereInput, query: PromotionListQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(15, Math.max(1, query.limit || 15));
    const [items, total] = await Promise.all([
      this.prisma.marketplacePromotion.findMany({
        where,
        include: promotionInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.marketplacePromotion.count({ where }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }

  private publicWhere(now = new Date()): Prisma.MarketplacePromotionWhereInput {
    return {
      status: MarketplacePromotionStatus.APPROVED,
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
      store: { isActive: true },
    };
  }

  private toPublic(promotion: PromotionRecord) {
    return {
      id: promotion.id,
      storeId: promotion.storeId,
      title: promotion.title,
      slug: promotion.slug,
      subtitle: promotion.subtitle,
      description: promotion.description,
      imageUrl: promotion.imageUrl,
      deepLink: promotion.deepLink,
      ctaLabel: promotion.ctaLabel,
      badgeText: promotion.badgeText,
      type: promotion.type,
      status: promotion.status,
      startsAt: promotion.startsAt,
      endsAt: promotion.endsAt,
      createdAt: promotion.createdAt,
      updatedAt: promotion.updatedAt,
      store: promotion.store,
      products: promotion.products
        .filter(
          ({ storeProduct }) =>
            storeProduct.isActive &&
            storeProduct.availability &&
            storeProduct.stockQuantity > 0 &&
            storeProduct.product.status,
        )
        .map(({ sortOrder, storeProduct }) => ({ sortOrder, storeProduct })),
    };
  }

  private async assertStoreAccess(userId: number, storeId: number, requireActive = true) {
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        OR: [{ ownerUserId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true, isActive: true },
    });
    if (!store) throw new ForbiddenException('You do not have access to this store.');
    if (requireActive && !store.isActive) {
      throw new ForbiddenException('The store must be approved and active.');
    }
  }

  private async assertProducts(storeId: number, ids: number[]) {
    if (!ids.length) return;
    const count = await this.prisma.storeProduct.count({
      where: { id: { in: ids }, storeId, isActive: true },
    });
    if (count !== ids.length) {
      throw new BadRequestException(
        'Every selected product must be an active offer from this store.',
      );
    }
  }

  private dates(startsAt?: string, endsAt?: string) {
    const start = startsAt ? new Date(startsAt) : new Date();
    const end = endsAt ? new Date(endsAt) : null;
    this.assertDateRange(start, end);
    return { startsAt: start, endsAt: end };
  }

  private assertDateRange(startsAt: Date, endsAt: Date | null) {
    if (endsAt && endsAt <= startsAt) {
      throw new BadRequestException('endsAt must be later than startsAt.');
    }
  }

  private slug(title: string) {
    const base = title
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 80);
    return `${base || 'promotion'}-${randomUUID().replaceAll('-', '').slice(0, 8)}`;
  }
}
