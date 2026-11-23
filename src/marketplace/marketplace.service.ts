import { BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CartService } from '../cart/cart.service';
import { StoreAvailabilityService } from '../stores/store-availability.service';
import { PublicPromotionListQueryDto } from '../promotions/dto/marketplace-promotion.dto';
import { PromotionsService } from '../promotions/promotions.service';
import {
  AddCompareDto,
  AddWishlistDto,
  BrowseMarketplaceDto,
  MoveWishlistToCartDto,
  SearchStoresDto,
} from './dto/marketplace.dto';

@Injectable()
export class MarketplaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cart?: CartService,
    private readonly availability: StoreAvailabilityService = new StoreAvailabilityService(),
    @Optional() private readonly promotionsService?: PromotionsService,
  ) {}

  async scan(code: string) {
    const normalized = code?.trim().toUpperCase();
    if (!normalized) throw new BadRequestException('A barcode or SKU is required.');
    const offer = await this.prisma.storeProduct.findFirst({
      where: {
        isActive: true,
        availability: true,
        store: { isActive: true },
        product: { status: true },
        OR: [{ barcode: normalized }, { sku: normalized }, { product: { barcode: normalized } }],
      },
      include: {
        product: {
          include: {
            images: true,
            offers: {
              where: { isActive: true, availability: true, store: { isActive: true } },
              include: { store: true },
              orderBy: { price: 'asc' },
            },
          },
        },
      },
    });
    if (!offer) throw new NotFoundException('No active product matches this scan.');
    return {
      matchType:
        offer.barcode === normalized
          ? 'store_barcode'
          : offer.sku?.toUpperCase() === normalized
            ? 'sku'
            : 'manufacturer_barcode',
      product: offer.product,
      offers: offer.product.offers,
    };
  }

  async home() {
    const [
      [categories, stores, featuredProducts, popularProducts, discountedProducts, rewardCampaigns],
      promotions,
    ] = await Promise.all([
      this.prisma.$transaction([
        this.prisma.category.findMany({
          where: {
            isActive: true,
            level: 0,
          },
          orderBy: { name: 'asc' },
          take: 12,
        }),
        this.prisma.store.findMany({
          where: { isActive: true },
          orderBy: { storeName: 'asc' },
          take: 12,
          select: {
            id: true,
            storeName: true,
            description: true,
            state: true,
            city: true,
            imageUrl: true,
            images: {
              select: {
                id: true,
                storeId: true,
                url: true,
                publicId: true,
                sortOrder: true,
                createdAt: true,
              },
              orderBy: { sortOrder: 'asc' },
            },
            latitude: true,
            longitude: true,
            isActive: true,
            timezone: true,
            temporarilyClosedUntil: true,
            operatingHours: true,
          },
        }),
        this.prisma.product.findMany({
          where: {
            status: true,
            offers: { some: { isActive: true, availability: true, store: { isActive: true } } },
          },
          include: {
            category: true,
            images: { orderBy: { sortOrder: 'asc' }, take: 3 },
            offers: {
              where: {
                isActive: true,
                availability: true,
                store: { isActive: true },
              },
              include: {
                store: {
                  select: {
                    id: true,
                    storeName: true,
                    state: true,
                    city: true,
                    imageUrl: true,
                  },
                },
              },
              orderBy: { price: 'asc' },
              take: 5,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        }),
        this.prisma.product.findMany({
          where: {
            status: true,
            offers: { some: { isActive: true, availability: true, store: { isActive: true } } },
          },
          include: {
            category: true,
            images: { orderBy: { sortOrder: 'asc' }, take: 2 },
            offers: {
              where: {
                isActive: true,
                availability: true,
                store: { isActive: true },
              },
              include: {
                store: {
                  select: {
                    id: true,
                    storeName: true,
                    state: true,
                    city: true,
                  },
                },
              },
              orderBy: { price: 'asc' },
              take: 3,
            },
          },
          orderBy: { orderItems: { _count: 'desc' } },
          take: 12,
        }),
        this.prisma.product.findMany({
          where: {
            status: true,
            offers: {
              some: {
                isActive: true,
                availability: true,
                discountPrice: { not: null },
                store: { isActive: true },
              },
            },
          },
          include: {
            category: true,
            images: { orderBy: { sortOrder: 'asc' }, take: 2 },
            offers: {
              where: {
                isActive: true,
                availability: true,
                discountPrice: { not: null },
                store: { isActive: true },
              },
              include: {
                store: {
                  select: {
                    id: true,
                    storeName: true,
                    state: true,
                    city: true,
                  },
                },
              },
              orderBy: { price: 'asc' },
              take: 3,
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        }),
        this.prisma.rewardVoucher.findMany({
          where: {
            storeId: { not: null },
            isActive: true,
            startsAt: { lte: new Date() },
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
            store: { isActive: true },
          },
          include: {
            store: {
              select: {
                id: true,
                storeName: true,
                city: true,
                state: true,
                imageUrl: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 12,
        }),
      ]),
      this.promotionsService ? this.promotionsService.publicHome(8) : Promise.resolve([]),
    ]);

    return {
      categories,
      stores: stores.map((store) => ({
        ...store,
        availability: this.availability.evaluate(store),
      })),
      featuredProducts,
      popularProducts,
      discountedProducts,
      promotions,
      rewardCampaigns,
    };
  }

  promotions(query: PublicPromotionListQueryDto) {
    return this.promotionsService!.publicList(query);
  }

  promotion(slug: string) {
    return this.promotionsService!.publicGet(slug);
  }

  async browse(query: BrowseMarketplaceDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(15, Math.max(1, Number(query.limit) || 15));
    const skip = (page - 1) * limit;
    if (
      query.minPrice !== undefined &&
      query.maxPrice !== undefined &&
      query.minPrice > query.maxPrice
    )
      throw new BadRequestException('minPrice cannot be greater than maxPrice.');

    const priceFilter =
      query.minPrice !== undefined || query.maxPrice !== undefined
        ? {
            ...(query.minPrice !== undefined ? { gte: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { lte: query.maxPrice } : {}),
          }
        : undefined;

    const offerWhere = {
      isActive: true,
      availability: true,
      store: { isActive: true },
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(priceFilter
        ? {
            OR: [
              { discountPrice: { not: null, ...priceFilter } },
              { discountPrice: null, price: priceFilter },
            ],
          }
        : {}),
    };

    const where = {
      status: true,
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q } },
              { brand: { contains: query.q } },
              { barcode: query.q },
            ],
          }
        : {}),
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      offers: {
        some: offerWhere,
      },
    };

    const candidates = await this.prisma.product.findMany({
      where,
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        offers: {
          where: offerWhere,
          include: {
            store: {
              select: {
                id: true,
                storeName: true,
                state: true,
                city: true,
                imageUrl: true,
                latitude: true,
                longitude: true,
                isActive: true,
                timezone: true,
                temporarilyClosedUntil: true,
                operatingHours: true,
              },
            },
          },
        },
      },
    });

    const search = query.q?.trim().toLocaleLowerCase();
    const effectivePrice = (product: (typeof candidates)[number]) =>
      Math.min(...product.offers.map((offer) => Number(offer.discountPrice ?? offer.price)));
    candidates.sort((a, b) => {
      if (query.sort === 'price_asc') return effectivePrice(a) - effectivePrice(b);
      if (query.sort === 'price_desc') return effectivePrice(b) - effectivePrice(a);
      if (query.sort === 'newest') return b.createdAt.getTime() - a.createdAt.getTime();
      if (search) {
        const rank = (item: typeof a) => {
          const name = item.name.toLocaleLowerCase();
          if (name === search) return 0;
          if (name.startsWith(search)) return 1;
          if (name.includes(search)) return 2;
          if (item.brand?.toLocaleLowerCase().includes(search)) return 3;
          return 4;
        };
        const difference = rank(a) - rank(b);
        if (difference) return difference;
      }
      return a.name.localeCompare(b.name);
    });
    const total = candidates.length;
    const items = candidates.slice(skip, skip + limit).map((product) => ({
      ...product,
      offers: product.offers
        .sort((a, b) => Number(a.discountPrice ?? a.price) - Number(b.discountPrice ?? b.price))
        .map((offer) => ({
          ...offer,
          store: {
            ...offer.store,
            availability: this.availability.evaluate(offer.store),
          },
        })),
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async product(productId: number) {
    const product = await this.prisma.product.findFirst({
      where: {
        id: productId,
        status: true,
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        reviews: {
          where: { isVerifiedPurchase: true },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        offers: {
          where: {
            isActive: true,
            availability: true,
            store: { isActive: true },
          },
          include: {
            store: {
              select: {
                id: true,
                storeName: true,
                state: true,
                city: true,
                address: true,
                imageUrl: true,
                latitude: true,
                longitude: true,
              },
            },
          },
          orderBy: { price: 'asc' },
        },
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return {
      ...product,
      comparison: {
        lowestPrice:
          product.offers.length > 0
            ? Math.min(...product.offers.map((offer) => Number(offer.discountPrice ?? offer.price)))
            : null,
        highestPrice:
          product.offers.length > 0
            ? Math.max(...product.offers.map((offer) => Number(offer.discountPrice ?? offer.price)))
            : null,
        storeCount: product.offers.length,
      },
    };
  }

  async stores(query: SearchStoresDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(15, Math.max(1, Number(query.limit) || 15));
    const skip = (page - 1) * limit;

    const where = {
      isActive: true,
      ...(query.state ? { state: query.state } : {}),
      ...(query.city ? { city: query.city } : {}),
      ...(query.q
        ? {
            OR: [
              { storeName: { contains: query.q } },
              { description: { contains: query.q } },
              { city: { contains: query.q } },
            ],
          }
        : {}),
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.store.findMany({
        where,
        skip,
        take: limit,
        include: {
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
          operatingHours: { orderBy: { dayOfWeek: 'asc' } },
          _count: {
            select: {
              products: true,
              reviews: true,
            },
          },
        },
        orderBy: { storeName: 'asc' },
      }),
      this.prisma.store.count({ where }),
    ]);

    return {
      items: items.map((store) => ({
        ...store,
        availability: this.availability.evaluate(store),
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    };
  }

  async store(storeId: number) {
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        isActive: true,
      },
      include: {
        category: true,
        images: { orderBy: { sortOrder: 'asc' } },
        operatingHours: { orderBy: { dayOfWeek: 'asc' } },
        products: {
          where: {
            isActive: true,
            availability: true,
          },
          include: {
            product: {
              include: {
                images: { orderBy: { sortOrder: 'asc' } },
                category: true,
              },
            },
          },
          orderBy: { updatedAt: 'desc' },
        },
        reviews: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!store) {
      throw new NotFoundException('Store not found.');
    }

    return { ...store, availability: this.availability.evaluate(store) };
  }

  async compare(productId: number) {
    return this.product(productId);
  }

  async addWishlist(userId: number, dto: AddWishlistDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, status: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    return this.prisma.wishlistItem.upsert({
      where: {
        userId_productId: {
          userId,
          productId: dto.productId,
        },
      },
      create: {
        userId,
        productId: dto.productId,
      },
      update: {},
      include: {
        product: {
          include: {
            images: true,
          },
        },
      },
    });
  }

  async wishlist(userId: number) {
    return this.prisma.wishlistItem.findMany({
      where: { userId },
      include: {
        product: {
          include: {
            category: true,
            images: { orderBy: { sortOrder: 'asc' } },
            offers: {
              where: {
                isActive: true,
                availability: true,
                store: { isActive: true },
              },
              include: {
                store: {
                  select: {
                    id: true,
                    storeName: true,
                    state: true,
                    city: true,
                  },
                },
              },
              orderBy: { price: 'asc' },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async removeWishlist(userId: number, productId: number) {
    await this.prisma.wishlistItem.deleteMany({
      where: {
        userId,
        productId,
      },
    });

    return {
      removed: true,
      productId,
    };
  }

  async moveWishlistToCart(userId: number, productId: number, dto: MoveWishlistToCartDto) {
    return this.prisma.$transaction(async (tx) => {
      const wishlistItem = await tx.wishlistItem.findUnique({
        where: { userId_productId: { userId, productId } },
      });
      if (!wishlistItem) throw new NotFoundException('Wishlist item not found.');
      const offer = await tx.storeProduct.findFirst({
        where: { id: dto.storeProductId, productId },
      });
      if (!offer) throw new BadRequestException('The selected offer does not match this product.');
      if (!this.cart) throw new Error('CartService is unavailable.');
      const cart = await this.cart.lock(tx, userId);
      await this.cart.addInTransaction(tx, cart.id, offer.id, dto.quantity);
      await tx.wishlistItem.delete({ where: { id: wishlistItem.id } });
      return {
        moved: true,
        productId,
        cart: await this.cart.recalculate(tx, cart.id),
      };
    });
  }

  async addCompare(userId: number, dto: AddCompareDto) {
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, status: true },
    });

    if (!product) {
      throw new NotFoundException('Product not found.');
    }

    const list = await this.prisma.compareList.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    const currentCount = await this.prisma.compareItem.count({
      where: { compareListId: list.id },
    });

    if (currentCount >= 10) {
      throw new BadRequestException('You can compare a maximum of 10 products at a time.');
    }

    return this.prisma.compareItem.upsert({
      where: {
        compareListId_productId: {
          compareListId: list.id,
          productId: dto.productId,
        },
      },
      create: {
        compareListId: list.id,
        productId: dto.productId,
      },
      update: {},
      include: {
        product: {
          include: {
            images: true,
          },
        },
      },
    });
  }

  async compareList(userId: number) {
    const list = await this.prisma.compareList.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            product: {
              include: {
                category: true,
                images: { orderBy: { sortOrder: 'asc' } },
                offers: {
                  where: {
                    isActive: true,
                    availability: true,
                    store: { isActive: true },
                  },
                  include: {
                    store: {
                      select: {
                        id: true,
                        storeName: true,
                        state: true,
                        city: true,
                      },
                    },
                  },
                  orderBy: { price: 'asc' },
                },
              },
            },
          },
        },
      },
    });

    return list ?? { items: [] };
  }

  async removeCompare(userId: number, productId: number) {
    const list = await this.prisma.compareList.findUnique({
      where: { userId },
    });

    if (!list) {
      return { removed: true, productId };
    }

    await this.prisma.compareItem.deleteMany({
      where: {
        compareListId: list.id,
        productId,
      },
    });

    return {
      removed: true,
      productId,
    };
  }
}
