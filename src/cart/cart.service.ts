import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: number) {
    return this.prisma.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: {
            storeProduct: {
              include: {
                product: { include: { images: true } },
                store: true,
              },
            },
          },
        },
      },
    });
  }

  async add(userId: number, storeProductId: number, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Quantity must be a positive integer.');
    }

    return this.prisma.$transaction(async (tx) => {
      const offer = await tx.storeProduct.findUnique({
        where: { id: storeProductId },
        include: { product: true },
      });

      if (!offer || !offer.isActive || !offer.availability) {
        throw new NotFoundException('Store product is not available.');
      }

      const existingItem = await tx.cartItem.findFirst({
        where: {
          cart: { userId },
          storeProductId,
        },
      });
      const desiredQuantity = (existingItem?.quantity ?? 0) + quantity;

      if (offer.stockQuantity < desiredQuantity) {
        throw new BadRequestException('Insufficient stock.');
      }

      const cart = await tx.cart.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });

      const unitPrice = offer.discountPrice ?? offer.price;

      await tx.cartItem.upsert({
        where: {
          cartId_storeProductId: {
            cartId: cart.id,
            storeProductId,
          },
        },
        create: {
          cartId: cart.id,
          storeProductId,
          quantity,
          unitPrice,
        },
        update: {
          quantity: { increment: quantity },
          unitPrice,
        },
      });

      return this.recalculate(tx, cart.id);
    });
  }

  async remove(userId: number, storeProductId: number) {
    const cart = await this.prisma.cart.findUnique({ where: { userId } });

    if (!cart) {
      throw new NotFoundException('Cart not found.');
    }

    await this.prisma.cartItem.deleteMany({
      where: {
        cartId: cart.id,
        storeProductId,
      },
    });

    return this.recalculate(this.prisma, cart.id);
  }

  async updateQuantity(userId: number, storeProductId: number, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException('Quantity must be a positive integer.');
    }

    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      throw new NotFoundException('Cart not found.');
    }

    const item = await this.prisma.cartItem.findUnique({
      where: {
        cartId_storeProductId: {
          cartId: cart.id,
          storeProductId,
        },
      },
      include: {
        storeProduct: true,
      },
    });

    if (!item) {
      throw new NotFoundException('Cart item not found.');
    }

    if (!item.storeProduct.isActive || !item.storeProduct.availability) {
      throw new BadRequestException('This product is no longer available.');
    }

    if (item.storeProduct.stockQuantity < quantity) {
      throw new BadRequestException('Requested quantity is greater than available stock.');
    }

    await this.prisma.cartItem.update({
      where: { id: item.id },
      data: {
        quantity,
        unitPrice: item.storeProduct.discountPrice ?? item.storeProduct.price,
      },
    });

    return this.recalculate(this.prisma, cart.id);
  }

  async clear(userId: number) {
    const cart = await this.prisma.cart.findUnique({
      where: { userId },
    });

    if (!cart) {
      return { cleared: true };
    }

    await this.prisma.cartItem.deleteMany({
      where: { cartId: cart.id },
    });

    return this.recalculate(this.prisma, cart.id);
  }

  private async recalculate(tx: Prisma.TransactionClient, cartId: number) {
    const items = await tx.cartItem.findMany({
      where: { cartId },
    });

    const subtotal = items.reduce(
      (sum: number, item: { unitPrice: unknown; quantity: number }) =>
        sum + Number(item.unitPrice) * item.quantity,
      0,
    );
    const totalItems = items.reduce(
      (sum: number, item: { quantity: number }) => sum + item.quantity,
      0,
    );

    return tx.cart.update({
      where: { id: cartId },
      data: { subtotal, totalItems },
      include: {
        items: {
          include: {
            storeProduct: {
              include: {
                product: { include: { images: true } },
                store: true,
              },
            },
          },
        },
      },
    });
  }
}
