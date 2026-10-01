import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../common/money';

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async profile(userId: number) {
    const existing = await this.prisma.referralProfile.findUnique({ where: { userId } });
    if (existing) return existing;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `PURSE${userId}${randomBytes(3).toString('hex')}`.toUpperCase();
      try {
        return await this.prisma.referralProfile.create({ data: { userId, code } });
      } catch {
        /* retry collision */
      }
    }
    throw new Error('Unable to allocate referral code.');
  }

  async me(userId: number) {
    const profile = await this.profile(userId);
    const referrals = await this.prisma.referral.findMany({ where: { referrerId: userId } });
    const total = referrals
      .filter((r) => r.status !== 'PENDING')
      .reduce((sum, row) => sum.add(row.rewardAmount), money(0));
    const base = this.config.get<string>('REFERRAL_SHARE_URL') ?? 'https://superstore.co/referral';
    return {
      referralCode: profile.code,
      referralLink: `${base.replace(/\/$/, '')}/${encodeURIComponent(profile.code)}`,
      rewardDescription:
        this.config.get<string>('REFERRAL_REWARD_DESCRIPTION') ??
        'Earn a discount when a referred friend completes their first purchase',
      totalReferred: referrals.length,
      successfulOrders: referrals.filter((r) => r.status !== 'PENDING').length,
      totalDiscountEarned: total.toFixed(2),
      currency: 'NGN',
      claimableAmount: referrals
        .filter((r) => r.status === 'QUALIFIED')
        .reduce((sum, row) => sum.add(row.rewardAmount), money(0))
        .toFixed(2),
    };
  }

  async claim(userId: number) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${userId} FOR UPDATE`;
      const rewards = await tx.referral.findMany({
        where: { referrerId: userId, status: 'QUALIFIED' },
      });
      const amount = rewards.reduce((sum, row) => sum.add(row.rewardAmount), money(0));
      if (amount.lte(0)) return { claimedAmount: '0.00', currency: 'NGN', claimedReferrals: 0 };
      const reference = `REFERRAL-${userId}-${randomUUID()}`;
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
          description: 'Referral reward claim',
        },
      });
      await tx.referral.updateMany({
        where: { id: { in: rewards.map((r) => r.id) }, status: 'QUALIFIED' },
        data: { status: 'CLAIMED', claimedAt: new Date() },
      });
      return {
        claimedAmount: amount.toFixed(2),
        currency: 'NGN',
        claimedReferrals: rewards.length,
        reference,
      };
    });
  }
}
