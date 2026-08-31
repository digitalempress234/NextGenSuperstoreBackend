import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: number, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    const store = await this.prisma.store.findUnique({ where: { id: dto.storeId } });

    if (!product || !store) {
      throw new NotFoundException('Product or store not found.');
    }

    const purchase = await this.prisma.orderItem.findFirst({
      where: {
        productId: dto.productId,
        order: {
          userId,
          storeId: dto.storeId,
          currentStatus: { in: ['DELIVERED', 'COMPLETED', 'READY_FOR_PICKUP'] },
        },
      },
    });

    if (!purchase) {
      throw new BadRequestException(
        'Only customers with a completed purchase can review this product.',
      );
    }

    return this.prisma.review.create({
      data: {
        userId,
        productId: dto.productId,
        storeId: dto.storeId,
        rating: dto.rating,
        comment: dto.comment,
        isVerifiedPurchase: true,
        status: 'PENDING',
      },
    });
  }

  async listForProduct(productId: number) {
    return this.prisma.review.findMany({
      where: {
        productId,
        status: 'APPROVED',
      },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            avatarUrl: true,
          },
        },
      },
    });
  }
}
