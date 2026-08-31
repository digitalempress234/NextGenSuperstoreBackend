import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

export class StoreWithdrawDto {
  amount!: number;
  bankName!: string;
  accountNumber!: string;
  accountName!: string;
  mode!: 'MANUAL' | 'AUTO';
}

@Injectable()
export class StoreWalletService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Get wallet balance ───────────────────────────────────────────────────────

  async getWallet(userId: number, storeId: number) {
    await this.assertOwner(userId, storeId);

    const wallet = await this.prisma.storeWallet.findUnique({
      where: { storeId },
      select: {
        id: true,
        balance: true,
        lockedBalance: true,
        updatedAt: true,
      },
    });

    return wallet ?? { balance: 0, lockedBalance: 0 };
  }

  // ─── Ledger ───────────────────────────────────────────────────────────────────

  async getTransactions(userId: number, storeId: number, page = 1, limit = 20) {
    await this.assertOwner(userId, storeId);

    const wallet = await this.requireWallet(storeId);
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.storeWalletTransaction.findMany({
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
          orderId: true,
          createdAt: true,
        },
      }),
      this.prisma.storeWalletTransaction.count({ where: { walletId: wallet.id } }),
    ]);

    return { items, total, page, limit };
  }

  // ─── Request Withdrawal ───────────────────────────────────────────────────────

  async requestWithdrawal(userId: number, storeId: number, dto: StoreWithdrawDto) {
    await this.assertOwner(userId, storeId);

    const wallet = await this.requireWallet(storeId);
    const available = Number(wallet.balance);

    if (dto.amount <= 0) {
      throw new BadRequestException('Withdrawal amount must be greater than zero.');
    }

    if (dto.amount > available) {
      throw new BadRequestException(`Insufficient balance. Available: ₦${available.toFixed(2)}.`);
    }

    const ref = `SW-${storeId}-${Date.now()}`;

    const withdrawal = await this.prisma.$transaction(async (tx) => {
      // Debit wallet immediately (funds are reserved)
      await tx.storeWallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: new Prisma.Decimal(dto.amount) } },
      });

      await tx.storeWalletTransaction.create({
        data: {
          walletId: wallet.id,
          amount: new Prisma.Decimal(dto.amount),
          type: 'DEBIT',
          reference: ref,
          description: `Withdrawal request — ${dto.mode} mode`,
        },
      });

      return tx.storeWithdrawal.create({
        data: {
          storeId,
          walletId: wallet.id,
          amount: new Prisma.Decimal(dto.amount),
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          accountName: dto.accountName,
          mode: dto.mode,
          status: 'PENDING',
        },
      });
    });

    // TODO: if dto.mode === 'AUTO', trigger Paystack Transfer API here

    return withdrawal;
  }

  // ─── List Withdrawals ─────────────────────────────────────────────────────────

  async getWithdrawals(userId: number, storeId: number) {
    await this.assertOwner(userId, storeId);

    return this.prisma.storeWithdrawal.findMany({
      where: { storeId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        amount: true,
        status: true,
        mode: true,
        bankName: true,
        accountNumber: true,
        accountName: true,
        providerRef: true,
        rejectionReason: true,
        reviewedAt: true,
        createdAt: true,
      },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  private async assertOwner(userId: number, storeId: number) {
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, ownerUserId: userId },
    });
    if (!store) {
      throw new NotFoundException('Store not found or you do not own it.');
    }
  }

  private async requireWallet(storeId: number) {
    const wallet = await this.prisma.storeWallet.findUnique({
      where: { storeId },
    });
    if (!wallet) {
      throw new BadRequestException(
        'This store does not have a wallet yet. Complete an order first.',
      );
    }
    return wallet;
  }
}
