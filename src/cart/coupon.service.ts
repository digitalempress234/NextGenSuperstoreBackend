import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../common/money';

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  async apply(userId: number, rawCode: string) {
    const code = rawCode.trim().toUpperCase();
    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { userId } });
      if (!cart || !cart.totalItems) throw new BadRequestException('Cart is empty.');
      const now = new Date();
      const coupon = await tx.coupon.findFirst({
        where: {
          code,
          isActive: true,
          startsAt: { lte: now },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });
      if (!coupon || (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit))
        throw new NotFoundException('Coupon is invalid or unavailable.');
      if (cart.subtotal.lt(coupon.minimumOrderAmount))
        throw new BadRequestException(
          `A minimum cart subtotal of ${coupon.minimumOrderAmount.toFixed(2)} is required.`,
        );
      await tx.cartCoupon.upsert({
        where: { cartId: cart.id },
        create: { cartId: cart.id, couponId: coupon.id, userId },
        update: { couponId: coupon.id, userId },
      });
      return {
        applied: true,
        code: coupon.code,
        discount: this.discount(coupon, cart.subtotal).toFixed(2),
        cartId: cart.id,
      };
    });
  }

  async remove(userId: number, code: string) {
    const application = await this.prisma.cartCoupon.findFirst({
      where: { userId, coupon: { code: code.trim().toUpperCase() } },
    });
    if (!application) throw new NotFoundException('Applied coupon not found.');
    await this.prisma.cartCoupon.delete({ where: { id: application.id } });
    return { removed: true, code: code.trim().toUpperCase() };
  }

  discount(
    coupon: {
      type: string;
      discountPercent: Prisma.Decimal | null;
      discountAmount: Prisma.Decimal | null;
      maximumDiscount: Prisma.Decimal | null;
    },
    subtotal: Prisma.Decimal,
  ) {
    let value =
      coupon.type === 'PERCENTAGE' && coupon.discountPercent
        ? subtotal.mul(coupon.discountPercent).div(100)
        : money(coupon.discountAmount ?? 0);
    if (coupon.maximumDiscount) value = Prisma.Decimal.min(value, coupon.maximumDiscount);
    return money(Prisma.Decimal.min(value, subtotal));
  }
}
