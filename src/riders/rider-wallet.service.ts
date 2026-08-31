import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export class RiderWithdrawDto {
  amount!: number;
  mode!: 'MANUAL' | 'AUTO';
}

@Injectable()
export class RiderWalletService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get wallet balance ───────────────────────────────────────────────────────

  async getWallet(userId: number) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId },
      select: { id: true, balance: true, updatedAt: true },
    });

    // Sum of HELD earnings that haven't been released yet
    const riderProfile = await this.prisma.riderProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    const heldAmount = riderProfile
      ? await this.prisma.riderEarning
          .aggregate({
            _sum: { amount: true },
            where: { riderId: riderProfile.id, status: 'HELD' },
          })
          .then((r) => Number(r._sum.amount ?? 0))
      : 0;

    return {
      balance: wallet ? Number(wallet.balance) : 0,
      heldBalance: heldAmount,
      availableBalance: wallet ? Number(wallet.balance) : 0,
    };
  }

  // ─── Ledger ───────────────────────────────────────────────────────────────────

  async getTransactions(userId: number, page = 1, limit = 20) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return { items: [], total: 0, page, limit };

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          amount: true,
          type: true,
          description: true,
          reference: true,
          createdAt: true,
        },
      }),
      this.prisma.walletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return { items, total, page, limit };
  }

  // ─── Request Withdrawal ───────────────────────────────────────────────────────

  async requestWithdrawal(userId: number, dto: RiderWithdrawDto) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    const available = wallet ? Number(wallet.balance) : 0;

    if (dto.amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be greater than zero.');
    }

    if (dto.amount > available) {
      throw new BadRequestException(`Insufficient balance. Available: ₦${available.toFixed(2)}.`);
    }

    // Use the rider's primary bank account
    const riderProfile = await this.prisma.riderProfile.findUnique({
      where: { userId },
      include: {
        bankAccounts: {
          where: { isPrimary: true },
          take: 1,
        },
      },
    });

    if (!riderProfile) throw new NotFoundException('Rider profile not found.');

    const primaryBank = riderProfile.bankAccounts[0];
    if (!primaryBank) {
      throw new BadRequestException(
        'No primary bank account found. Please add and verify a bank account first.',
      );
    }

    const ref = `RW-${userId}-${Date.now()}`;

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      // Debit wallet immediately
      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: new Prisma.Decimal(dto.amount) } },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet!.id,
          amount: new Prisma.Decimal(dto.amount),
          type: 'DEBIT',
          reference: ref,
          description: `Withdrawal request — ${dto.mode} mode`,
        },
      });

      return tx.withdrawal.create({
        data: {
          userId,
          amount: new Prisma.Decimal(dto.amount),
          bankName: primaryBank.bankName,
          accountNumber: primaryBank.accountNumber,
          accountName: primaryBank.accountName,
          mode: dto.mode,
          status: 'PENDING',
        },
      });
    });

    // TODO: if dto.mode === 'AUTO', trigger Paystack Transfer API here

    return withdrawal;
  }

  // ─── List Withdrawals ─────────────────────────────────────────────────────────

  async getWithdrawals(userId: number) {
    return this.prisma.withdrawal.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        status: true,
        mode: true,
        bankName: true,
        accountNumber: true,
        providerRef: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
      },
    });
  }
}
