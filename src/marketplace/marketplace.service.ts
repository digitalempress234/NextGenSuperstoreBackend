import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import {
  AddCompareDto,
  AddWishlistDto,
  BrowseMarketplaceDto,
  SearchStoresDto,
} from './dto/marketplace.dto';

@Injectable()
export class MarketplaceService {
  constructor(private readonly prisma: PrismaService) {}

  async home() {
    const [categories, stores, featuredProducts, popularProducts] =
      await this.prisma.$transaction([
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
            latitude: true,
            longitude: true,
          },
        }),
        this.prisma.product.findMany({
          where: { status: true },
          include: {
            category: true,
            images: { orderBy: { sortOrder: 'asc' }, take: 3 },
            offers: {
              where: {
                isActive: true,
                availability: true,
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
          where: { status: true },
          include: {
            category: true,
            images: { orderBy: { sortOrder: 'asc' }, take: 2 },
            offers: {
              where: {
                isActive: true,
                availability: true,
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
      ]);

    return {
      categories,
      stores,
      featuredProducts,
      popularProducts,
    };
  }

  async browse(query: BrowseMarketplaceDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const priceFilter =
      query.minPrice || query.maxPrice
        ? {
            ...(query.minPrice ? { gte: Number(query.minPrice) } : {}),
            ...(query.maxPrice ? { lte: Number(query.maxPrice) } : {}),
          }
        : undefined;

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
        some: {
          isActive: true,
          availability: true,
          ...(query.storeId ? { storeId: query.storeId } : {}),
          ...(priceFilter ? { price: priceFilter } : {}),
        },
      },
    };

    const orderBy =
      query.sort === 'newest'
        ? { createdAt: 'desc' as const }
        : { name: 'asc' as const };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          images: { orderBy: { sortOrder: 'asc' } },
          offers: {
            where: {
              isActive: true,
              availability: true,
              ...(query.storeId ? { storeId: query.storeId } : {}),
              ...(priceFilter ? { price: priceFilter } : {}),
            },
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
                },
              },
            },
            orderBy: { price: 'asc' },
          },
        },
        skip,
        take: limit,
        orderBy,
      }),
      this.prisma.product.count({ where }),
    ]);

    if (query.sort === 'price_desc' || query.sort === 'price_asc') {
      items.sort((a, b) => {
        const aPrice = Math.min(
          ...a.offers.map((offer) =>
            Number(offer.discountPrice ?? offer.price),
          ),
        );
        const bPrice = Math.min(
          ...b.offers.map((offer) =>
            Number(offer.discountPrice ?? offer.price),
          ),
        );

        return query.sort === 'price_asc'
          ? aPrice - bPrice
          : bPrice - aPrice;
      });
    }

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
            ? Math.min(
                ...product.offers.map((offer) =>
                  Number(offer.discountPrice ?? offer.price),
                ),
              )
            : null,
        highestPrice:
          product.offers.length > 0
            ? Math.max(
                ...product.offers.map((offer) =>
                  Number(offer.discountPrice ?? offer.price),
                ),
              )
            : null,
        storeCount: product.offers.length,
      },
    };
  }

  async stores(query: SearchStoresDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
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
      items,
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

    return store;
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
      throw new BadRequestException(
        'You can compare a maximum of 10 products at a time.',
      );
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
