import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../common/money';
import type { SaveVoucherDto } from './dto/rewards.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RewardsService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private async availableCashback(userId: number, tx: Prisma.TransactionClient = this.prisma) {
    const rows = await tx.cashbackReward.findMany({ where: { userId, status: 'AVAILABLE' } });
    return rows.reduce((sum, row) => sum.add(row.amount.sub(row.redeemedAmount)), money(0));
  }

  async summary(userId: number) {
    const [totalCashback, account, activeVouchersCount] = await Promise.all([
      this.availableCashback(userId),
      this.prisma.rewardAccount.findUnique({ where: { userId } }),
      this.prisma.userVoucher.count({
        where: {
          userId,
          status: 'CLAIMED',
          voucher: { isActive: true, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        },
      }),
    ]);
    return {
      totalCashback: totalCashback.toFixed(2),
      availablePoints: account?.availablePoints ?? 0,
      giveawayEntries: account?.giveawayEntries ?? 0,
      activeVouchersCount,
      currency: 'NGN',
    };
  }

  async cashback(userId: number, page = 1, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    const [totalCashback, history, total] = await Promise.all([
      this.availableCashback(userId),
      this.prisma.cashbackReward.findMany({
        where: { userId },
        include: { order: { select: { orderNumber: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.cashbackReward.count({ where: { userId } }),
    ]);
    return {
      totalCashback: totalCashback.toFixed(2),
      currency: 'NGN',
      page,
      limit,
      total,
      history: history.map((row) => ({
        id: row.id,
        orderId: row.orderId,
        orderNumber: row.order.orderNumber,
        percentage: row.percentage.toString(),
        amount: row.amount.toFixed(2),
        redeemedAmount: row.redeemedAmount.toFixed(2),
        status: row.status.toLowerCase(),
        createdAt: row.createdAt,
      })),
    };
  }

  async redeem(userId: number, rawAmount: string) {
    const amount = money(rawAmount);
    if (amount.lte(0))
      throw new BadRequestException('Redemption amount must be greater than zero.');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
      const rows = await tx.cashbackReward.findMany({
        where: { userId, status: 'AVAILABLE' },
        orderBy: { createdAt: 'asc' },
      });
      const available = rows.reduce(
        (sum, row) => sum.add(row.amount.sub(row.redeemedAmount)),
        money(0),
      );
      if (available.lt(amount)) throw new BadRequestException('Insufficient cashback balance.');
      let remaining = amount;
      for (const row of rows) {
        if (remaining.lte(0)) break;
        const balance = row.amount.sub(row.redeemedAmount);
        const applied = Prisma.Decimal.min(balance, remaining);
        const redeemedAmount = row.redeemedAmount.add(applied);
        await tx.cashbackReward.update({
          where: { id: row.id },
          data: {
            redeemedAmount,
            status: redeemedAmount.eq(row.amount) ? 'REDEEMED' : 'AVAILABLE',
            redeemedAt: redeemedAmount.eq(row.amount) ? new Date() : null,
          },
        });
        remaining = remaining.sub(applied);
      }
      const reference = `CASHBACK-${userId}-${randomUUID()}`;
      const wallet = await tx.wallet.upsert({
        where: { userId },
        create: { userId, balance: amount },
        update: { balance: { increment: amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount,
          type: 'CREDIT',
          reference,
          description: 'Cashback redemption',
        },
      });
      await tx.rewardRedemption.create({ data: { userId, amount, reference } });
      return {
        amount: amount.toFixed(2),
        availableCashback: available.sub(amount).toFixed(2),
        walletBalance: wallet.balance.toFixed(2),
        currency: 'NGN',
        reference,
      };
    });
    await this.notifications?.notifyUser({
      userId,
      type: 'REWARD_UPDATE',
      title: 'Cashback redeemed',
      message: `₦${result.amount} cashback has been added to your wallet.`,
      data: { amount: result.amount, reference: result.reference, action: 'cashback_redeemed' },
      eventKey: `cashback-redeemed:${result.reference}`,
    });
    return result;
  }

  async vouchers(userId: number, page = 1, limit = 15) {
    limit = Math.min(15, Math.max(1, limit));
    const now = new Date();
    const where = {
      isActive: true,
      startsAt: { lte: now },
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    };
    const [definitions, total, account] = await Promise.all([
      this.prisma.rewardVoucher.findMany({
        where,
        include: { store: { select: { storeName: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.rewardVoucher.count({ where }),
      this.prisma.rewardAccount.findUnique({ where: { userId } }),
    ]);
    const owned = await this.prisma.userVoucher.findMany({
      where: { userId, voucherId: { in: definitions.map((voucher) => voucher.id) } },
    });
    const status = new Map(owned.map((item) => [item.voucherId, item.status.toLowerCase()]));
    const availablePoints = account?.availablePoints ?? 0;
    return {
      vouchers: definitions.map((v) => {
        const voucherStatus = status.get(v.id) ?? 'available';
        const canClaim = voucherStatus === 'available' && availablePoints >= v.pointsCost;
        const eligibilityReason =
          voucherStatus !== 'available'
            ? `already_${voucherStatus}`
            : canClaim
              ? null
              : 'insufficient_points';
        return {
          id: v.id,
          code: v.code,
          type: v.type,
          storeId: v.storeId,
          storeName: v.store?.storeName,
          title: v.title,
          subtitle: v.subtitle,
          description: v.description,
          minimumOrderAmount: v.minimumOrderAmount.toFixed(2),
          discountPercent: v.discountPercent?.toString(),
          discountAmount: v.discountAmount?.toFixed(2),
          pointsCost: v.pointsCost,
          giveawayEntries: v.giveawayEntries,
          availablePoints,
          canClaim,
          eligibilityReason,
          status: voucherStatus,
          tags: [
            v.pointsCost ? `${v.pointsCost} points` : null,
            v.giveawayEntries ? `${v.giveawayEntries} giveaway entries` : null,
          ].filter(Boolean),
          expiresAt: v.expiresAt,
        };
      }),
      availablePoints,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async claim(userId: number, id: string) {
    const result = await this.prisma.$transaction(async (tx) => {
      const voucher = await tx.rewardVoucher.findFirst({
        where: {
          id,
          isActive: true,
          startsAt: { lte: new Date() },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      });
      if (!voucher) throw new NotFoundException('Voucher is unavailable.');
      const existing = await tx.userVoucher.findUnique({
        where: { userId_voucherId: { userId, voucherId: id } },
      });
      if (existing) return { item: existing, created: false, title: voucher.title };
      const account = await tx.rewardAccount.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      if (account.availablePoints < voucher.pointsCost)
        throw new BadRequestException({
          message: 'Insufficient reward points.',
          data: {
            requiredPoints: voucher.pointsCost,
            availablePoints: account.availablePoints,
            shortfall: voucher.pointsCost - account.availablePoints,
          },
        });
      if (voucher.pointsCost)
        await tx.rewardAccount.update({
          where: { userId },
          data: { availablePoints: { decrement: voucher.pointsCost } },
        });
      return {
        item: await tx.userVoucher.create({ data: { userId, voucherId: id } }),
        created: true,
        title: voucher.title,
      };
    });
    if (result.created) {
      await this.notifications?.notifyUser({
        userId,
        type: 'REWARD_UPDATE',
        title: 'Voucher claimed',
        message: `${result.title} is now available in your rewards.`,
        data: { voucherId: id, action: 'voucher_claimed' },
        eventKey: `voucher-claimed:${id}:${userId}`,
      });
    }
    return result.item;
  }

  async apply(userId: number, selector: string) {
    return this.prisma.$transaction(async (tx) => {
      const cart = await tx.cart.findUnique({ where: { userId } });
      if (!cart || !cart.totalItems) throw new BadRequestException('Cart is empty.');
      const voucher = await tx.rewardVoucher.findFirst({
        where: { OR: [{ id: selector }, { code: selector.toUpperCase() }] },
      });
      if (!voucher) throw new NotFoundException('Voucher not found.');
      const owned = await tx.userVoucher.findUnique({
        where: { userId_voucherId: { userId, voucherId: voucher.id } },
      });
      if (!owned || owned.status !== 'CLAIMED')
        throw new ConflictException('Claim this voucher before applying it.');
      if (
        !voucher.isActive ||
        voucher.startsAt > new Date() ||
        (voucher.expiresAt && voucher.expiresAt <= new Date())
      )
        throw new BadRequestException('Voucher has expired or is inactive.');
      if (cart.subtotal.lt(voucher.minimumOrderAmount))
        throw new BadRequestException(
          `A minimum cart subtotal of ${voucher.minimumOrderAmount.toFixed(2)} is required.`,
        );
      await tx.cartVoucher.upsert({
        where: { cartId: cart.id },
        create: { cartId: cart.id, voucherId: voucher.id, userId },
        update: { voucherId: voucher.id, userId },
      });
      return { applied: true, voucherId: voucher.id, code: voucher.code, cartId: cart.id };
    });
  }

  adminVouchers() {
    return this.prisma.rewardVoucher.findMany({
      include: { store: true },
      orderBy: { createdAt: 'desc' },
    });
  }
  saveVoucher(dto: SaveVoucherDto, id?: string) {
    const data = {
      ...dto,
      code: dto.code.trim().toUpperCase(),
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    };
    return id
      ? this.prisma.rewardVoucher.update({ where: { id }, data })
      : this.prisma.rewardVoucher.create({ data });
  }
}
