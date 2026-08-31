import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

/** Default rates used when no .env var and no PlatformConfig row exists. */
const DEFAULTS = {
  vat_rate: 0.075,
  service_charge_rate: 0.05,
  platform_fee_rate: 0.05,
} as const;

type RateKey = keyof typeof DEFAULTS;
type TxClient = Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

@Injectable()
export class SettlementsService {
  private readonly logger = new Logger(SettlementsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  // ─── Rate Resolution ─────────────────────────────────────────────────────────

  /**
   * Resolves a platform rate with the following priority:
   * 1. PlatformConfig row (admin-set at runtime)
   * 2. .env variable (e.g. VAT_RATE)
   * 3. Hardcoded fallback
   */
  private async getRate(key: RateKey, tx: TxClient): Promise<number> {
    const row = await tx.platformConfig.findUnique({ where: { key } });
    if (row) {
      const parsed = parseFloat(row.value);
      if (!isNaN(parsed)) return parsed;
    }

    const envKey = key.toUpperCase(); // e.g. "VAT_RATE"
    const envVal = this.config.get<string>(envKey);
    if (envVal) {
      const parsed = parseFloat(envVal);
      if (!isNaN(parsed)) return parsed;
    }

    return DEFAULTS[key];
  }

  // ─── Order Settlement ─────────────────────────────────────────────────────────

  /**
   * Settles a confirmed order:
   * - Credits the store wallet (subtotal minus VAT, service charge, platform fee)
   * - HOLDs the shippingFee in the rider's wallet until delivery is confirmed
   * - Creates a RiderEarning record (HELD)
   *
   * Must be called inside an existing Prisma transaction.
   */
  async settleOrder(orderId: number, tx: TxClient): Promise<void> {
    const order = await tx.order.findUnique({
      where: { id: orderId },
      include: {
        delivery: { include: { rider: { include: { riderProfile: true } } } },
      },
    });

    if (!order) {
      this.logger.warn(`settleOrder: order ${orderId} not found — skipping`);
      return;
    }

    const subtotal = Number(order.subtotal);
    const shippingFee = Number(order.shippingFee);

    // ── Compute deductions ──
    const vatRate           = await this.getRate('vat_rate', tx);
    const serviceChargeRate = await this.getRate('service_charge_rate', tx);
    const platformFeeRate   = await this.getRate('platform_fee_rate', tx);

    const vatAmt           = subtotal * vatRate;
    const serviceChargeAmt = subtotal * serviceChargeRate;
    const platformFeeAmt   = subtotal * platformFeeRate;
    const storeAmt         = subtotal - vatAmt - serviceChargeAmt - platformFeeAmt;

    this.logger.log(
      `Settling order ${order.orderNumber}: subtotal=${subtotal} ` +
      `vat=${vatAmt.toFixed(2)} svc=${serviceChargeAmt.toFixed(2)} ` +
      `fee=${platformFeeAmt.toFixed(2)} store=${storeAmt.toFixed(2)} rider=${shippingFee}`,
    );

    // ── Store wallet ──
    const storeWallet = await tx.storeWallet.upsert({
      where: { storeId: order.storeId },
      create: { storeId: order.storeId, balance: 0, lockedBalance: 0 },
      update: {},
    });

    await tx.storeWallet.update({
      where: { id: storeWallet.id },
      data: { balance: { increment: new Prisma.Decimal(storeAmt) } },
    });

    await tx.storeWalletTransaction.create({
      data: {
        walletId: storeWallet.id,
        amount: new Prisma.Decimal(storeAmt),
        type: 'CREDIT',
        reference: `ORDER-${order.orderNumber}`,
        orderId: order.id,
        description: JSON.stringify({
          subtotal,
          vatRate,      vatAmt:           parseFloat(vatAmt.toFixed(2)),
          serviceChargeRate, serviceChargeAmt: parseFloat(serviceChargeAmt.toFixed(2)),
          platformFeeRate,   platformFeeAmt:   parseFloat(platformFeeAmt.toFixed(2)),
          storeAmt:          parseFloat(storeAmt.toFixed(2)),
        }),
      },
    });

    // ── Rider wallet (HOLD) — only if a rider is assigned ──
    const riderId = order.delivery?.riderId;
    if (riderId && shippingFee > 0) {
      const riderUser = await tx.user.findUnique({
        where: { id: riderId },
        include: { riderProfile: true },
      });

      if (riderUser?.riderProfile) {
        // Ensure rider Wallet exists
        const riderWallet = await tx.wallet.upsert({
          where: { userId: riderId },
          create: { userId: riderId, balance: 0 },
          update: {},
        });

        // HOLD transaction (does NOT yet increase available balance)
        await tx.walletTransaction.create({
          data: {
            walletId: riderWallet.id,
            amount: new Prisma.Decimal(shippingFee),
            type: 'HOLD',
            reference: `DELIVERY-HOLD-${order.delivery!.id}`,
            description: `Delivery fee held for order ${order.orderNumber}`,
          },
        });

        // Create RiderEarning record
        await tx.riderEarning.create({
          data: {
            riderId: riderUser.riderProfile.id,
            deliveryId: order.delivery!.id,
            amount: new Prisma.Decimal(shippingFee),
            status: 'HELD',
          },
        });
      }
    }
  }

  // ─── Rider Earning Release ────────────────────────────────────────────────────

  /**
   * Releases a rider's held delivery earning when an order is marked DELIVERED.
   * Moves the HOLD → RELEASE and increments the rider's available wallet balance.
   *
   * Must be called inside an existing Prisma transaction.
   */
  async releaseRiderEarning(deliveryId: number, tx: TxClient): Promise<void> {
    const earning = await tx.riderEarning.findUnique({
      where: { deliveryId },
      include: { riderProfile: true },
    });

    if (!earning || earning.status === 'RELEASED') {
      return; // Already released or not found — safe to skip
    }

    const riderWallet = await tx.wallet.findUnique({
      where: { userId: earning.riderProfile.userId },
    });

    if (!riderWallet) {
      this.logger.warn(`releaseRiderEarning: no wallet for rider userId=${earning.riderProfile.userId}`);
      return;
    }

    // RELEASE transaction — adds to available balance
    await tx.walletTransaction.create({
      data: {
        walletId: riderWallet.id,
        amount: earning.amount,
        type: 'RELEASE',
        reference: `DELIVERY-RELEASE-${deliveryId}`,
        description: `Delivery fee released for delivery #${deliveryId}`,
      },
    });

    // Increment available wallet balance
    await tx.wallet.update({
      where: { id: riderWallet.id },
      data: { balance: { increment: earning.amount } },
    });

    // Mark earning as released
    await tx.riderEarning.update({
      where: { id: earning.id },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });

    this.logger.log(
      `Released ₦${earning.amount} to rider userId=${earning.riderProfile.userId} for delivery #${deliveryId}`,
    );
  }
}
