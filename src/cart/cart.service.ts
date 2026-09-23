import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AddCartItemDto } from './dto/cart.dto';

export const cartInclude = {
  items: {
    orderBy: { id: 'asc' as const },
    include: {
      storeProduct: {
        include: { product: { include: { images: true, category: true } }, store: true },
      },
    },
  },
} satisfies Prisma.CartInclude;

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  async lock(tx: Prisma.TransactionClient, userId: number) {
    // Acquire the user lock before any consistent read establishes a MySQL snapshot.
    // This also serializes the first cart creation and concurrent payment callbacks.
    await tx.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`);
    const cart = await tx.cart.upsert({ where: { userId }, create: { userId }, update: {} });
    await tx.$queryRaw(Prisma.sql`SELECT id FROM Cart WHERE id = ${cart.id} FOR UPDATE`);
    return cart;
  }

  async get(userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.lock(tx, userId);
      return this.recalculate(tx, cart.id, true);
    });
  }

  async add(userId: number, storeProductId: number, quantity: number) {
    this.validateQuantity(quantity);
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.lock(tx, userId);
      await this.addInTransaction(tx, cart.id, storeProductId, quantity);
      return this.recalculate(tx, cart.id);
    });
  }

  async addSelection(userId: number, input: AddCartItemDto) {
    if (input.storeProductId !== undefined) {
      const offer = await this.prisma.storeProduct.findUnique({
        where: { id: input.storeProductId },
      });
      if (!offer) throw new NotFoundException('Store product not found.');
      if (
        (input.productId !== undefined && offer.productId !== input.productId) ||
        (input.storeId !== undefined && offer.storeId !== input.storeId)
      ) {
        throw new BadRequestException('Product and store do not match the selected offer.');
      }
      return this.add(userId, offer.id, input.quantity);
    }
    if (!input.productId)
      throw new BadRequestException('A product or store product ID is required.');
    const offers = await this.prisma.storeProduct.findMany({
      where: {
        productId: input.productId,
        ...(input.storeId ? { storeId: input.storeId } : {}),
        isActive: true,
        availability: true,
        store: { isActive: true },
        product: { status: true },
      },
      select: { id: true, storeId: true },
      take: 2,
    });
    if (!offers.length) throw new NotFoundException('Product is unavailable.');
    if (offers.length > 1)
      throw new ConflictException({
        message: 'Choose a store-specific offer for this product.',
        data: { productId: input.productId },
      });
    return this.add(userId, offers[0].id, input.quantity);
  }

  async addInTransaction(
    tx: Prisma.TransactionClient,
    cartId: number,
    storeProductId: number,
    quantity: number,
  ) {
    this.validateQuantity(quantity);
    const offer = await tx.storeProduct.findUnique({
      where: { id: storeProductId },
      include: { product: true, store: true },
    });
    if (
      !offer ||
      !offer.isActive ||
      !offer.availability ||
      !offer.product.status ||
      !offer.store.isActive
    )
      throw new NotFoundException('Store product is not available.');
    const existing = await tx.cartItem.findUnique({
      where: { cartId_storeProductId: { cartId, storeProductId } },
    });
    const desired = (existing?.quantity ?? 0) + quantity;
    if (offer.stockQuantity < desired)
      throw new ConflictException({
        message: 'Requested quantity exceeds available stock',
        data: { availableStock: offer.stockQuantity, storeProductId },
      });
    const unitPrice = offer.discountPrice ?? offer.price;
    await tx.cartItem.upsert({
      where: { cartId_storeProductId: { cartId, storeProductId } },
      create: { cartId, storeProductId, quantity, unitPrice },
      update: { quantity: desired, unitPrice },
    });
  }

  async updateQuantity(userId: number, storeProductId: number, quantity: number) {
    this.validateQuantity(quantity);
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.lock(tx, userId);
      const item = await tx.cartItem.findUnique({
        where: { cartId_storeProductId: { cartId: cart.id, storeProductId } },
        include: { storeProduct: true },
      });
      if (!item) throw new NotFoundException('Cart item not found.');
      const offer = item.storeProduct;
      if (!offer.isActive || !offer.availability || offer.stockQuantity < quantity) {
        throw new ConflictException({
          message: 'Requested quantity is unavailable',
          data: { availableStock: offer.stockQuantity, storeProductId },
        });
      }
      await tx.cartItem.update({
        where: { id: item.id },
        data: { quantity, unitPrice: offer.discountPrice ?? offer.price },
      });
      return this.recalculate(tx, cart.id);
    });
  }

  async remove(userId: number, storeProductId: number) {
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.lock(tx, userId);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id, storeProductId } });
      return this.recalculate(tx, cart.id);
    });
  }

  async clear(userId: number) {
    return this.prisma.$transaction(async (tx) => {
      const cart = await this.lock(tx, userId);
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      return this.recalculate(tx, cart.id);
    });
  }

  async recalculate(tx: Prisma.TransactionClient, cartId: number, refreshPrices = false) {
    let cart = await tx.cart.findUniqueOrThrow({ where: { id: cartId }, include: cartInclude });
    if (refreshPrices) {
      for (const item of cart.items) {
        const unitPrice = item.storeProduct.discountPrice ?? item.storeProduct.price;
        if (!item.unitPrice.equals(unitPrice))
          await tx.cartItem.update({ where: { id: item.id }, data: { unitPrice } });
      }
      cart = await tx.cart.findUniqueOrThrow({ where: { id: cartId }, include: cartInclude });
    }
    const subtotal = cart.items.reduce(
      (sum, item) => sum.add(item.unitPrice.mul(item.quantity)),
      new Prisma.Decimal(0),
    );
    const totalItems = cart.items.reduce((sum, item) => sum + item.quantity, 0);
    await tx.cart.update({ where: { id: cart.id }, data: { subtotal, totalItems } });
    return {
      ...cart,
      subtotal,
      totalItems,
      shippingFee: 0,
      items: cart.items.map((item) => ({
        ...item,
        productId: item.storeProduct.productId,
        totalPrice: item.unitPrice.mul(item.quantity),
        product: {
          id: item.storeProduct.productId,
          productName: item.storeProduct.product.name,
          price: item.storeProduct.price,
          discountPrice: item.storeProduct.discountPrice,
          displayImage: item.storeProduct.product.images[0]?.url ?? null,
          category: item.storeProduct.product.category?.name ?? null,
          stock: item.storeProduct.stockQuantity,
        },
      })),
    };
  }

  private validateQuantity(quantity: number) {
    if (!Number.isSafeInteger(quantity) || quantity < 1)
      throw new BadRequestException('Quantity must be a positive integer.');
  }
}
