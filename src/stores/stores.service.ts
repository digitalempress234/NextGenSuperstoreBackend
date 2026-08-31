import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto, UpdateStoreDto, UpsertStoreProductDto } from './dto/store.dto';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.store.findMany({
      where: { isActive: true },
      include: { category: true },
      orderBy: { storeName: 'asc' },
    });
  }

  mine(userId: number) {
    return this.prisma.store.findMany({
      where: { ownerUserId: userId },
      include: {
        category: true,
        products: {
          include: {
            product: { include: { images: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
        price: body.price,
        discountPrice: body.discountPrice,
        discountType: body.discountType,
        stockQuantity: body.stockQuantity,
      },
      update: {
        sku: body.sku,
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
