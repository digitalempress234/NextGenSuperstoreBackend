import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { money } from '../common/money';

const DEFAULTS = { vat_rate: '0.075', service_charge_rate: '0.05', platform_fee_rate: '0.05' };
type RateKey = keyof typeof DEFAULTS;

@Injectable()
export class SettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}
  private async getRate(key: RateKey, tx: Prisma.TransactionClient) {
    const row = await tx.platformConfig.findUnique({ where: { key } });
    const rate = new Prisma.Decimal(
      row?.value ?? this.config.get<string>(key.toUpperCase()) ?? DEFAULTS[key],
    );
    if (!rate.isFinite() || rate.lt(0) || rate.gt(1))
      throw new BadRequestException('Invalid settlement rate configuration.');
    return rate;
  }

  async settleOrder(orderId: number, tx: Prisma.TransactionClient) {
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    const reference = 'ORDER-' + order.orderNumber;
    if (await tx.storeWalletTransaction.findUnique({ where: { reference } })) return;
    const vatRate = await this.getRate('vat_rate', tx);
    const serviceChargeRate = await this.getRate('service_charge_rate', tx);
    const platformFeeRate = await this.getRate('platform_fee_rate', tx);
    if (vatRate.add(serviceChargeRate).add(platformFeeRate).gt(1))
      throw new BadRequestException('Settlement deductions exceed the order subtotal.');
    const vatAmt = money(order.subtotal.mul(vatRate));
    const serviceChargeAmt = money(order.subtotal.mul(serviceChargeRate));
    const platformFeeAmt = money(order.subtotal.mul(platformFeeRate));
    const storeAmt = order.subtotal.sub(vatAmt).sub(serviceChargeAmt).sub(platformFeeAmt);
    if (storeAmt.isNegative())
      throw new BadRequestException('Settlement deductions exceed the order subtotal.');
    const wallet = await tx.storeWallet.upsert({
      where: { storeId: order.storeId },
      create: { storeId: order.storeId },
      update: {},
    });
    await tx.storeWalletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: storeAmt,
        type: 'CREDIT',
        reference,
        orderId,
        description: JSON.stringify({
          subtotal: order.subtotal,
          vatRate,
          vatAmt,
          serviceChargeRate,
          serviceChargeAmt,
          platformFeeRate,
          platformFeeAmt,
          storeAmt,
        }),
      },
    });
    await tx.storeWallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: storeAmt } },
    });
    const delivery = await tx.delivery.findUnique({ where: { orderId } });
    if (delivery) await this.holdRiderEarning(delivery.id, tx);
  }

  async holdRiderEarning(deliveryId: number, tx: Prisma.TransactionClient) {
    const delivery = await tx.delivery.findUnique({
      where: { id: deliveryId },
      include: { order: true },
    });
    if (!delivery?.riderId || delivery.order.shippingFee.lte(0)) return;
    const funded = await tx.checkoutPaymentAllocation.findFirst({
      where: {
        orderId: delivery.orderId,
        paymentGroup: { OR: [{ status: 'PAID' }, { payment: { is: { status: 'PAID' } } }] },
      },
    });
    if (!funded) return;
    if (await tx.riderEarning.findUnique({ where: { deliveryId } })) return;
    const profile = await tx.riderProfile.findUnique({ where: { userId: delivery.riderId } });
    if (!profile) return;
    const wallet = await tx.wallet.upsert({
      where: { userId: delivery.riderId },
      create: { userId: delivery.riderId },
      update: {},
    });
    await tx.riderEarning.create({
      data: { riderId: profile.id, deliveryId, amount: delivery.order.shippingFee },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: delivery.order.shippingFee,
        type: 'HOLD',
        reference: 'DELIVERY-HOLD-' + deliveryId,
        description: 'Delivery fee held for order ' + delivery.order.orderNumber,
      },
    });
  }

  async releaseRiderEarning(deliveryId: number, tx: Prisma.TransactionClient) {
    const earning = await tx.riderEarning.findUnique({
      where: { deliveryId },
      include: { riderProfile: true },
    });
    if (!earning || earning.status === 'RELEASED') return;
    const claimed = await tx.riderEarning.updateMany({
      where: { id: earning.id, status: 'HELD' },
      data: { status: 'RELEASED', releasedAt: new Date() },
    });
    if (!claimed.count) return;
    const wallet = await tx.wallet.findUniqueOrThrow({
      where: { userId: earning.riderProfile.userId },
    });
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        amount: earning.amount,
        type: 'RELEASE',
        reference: 'DELIVERY-RELEASE-' + deliveryId,
        description: 'Delivery fee released',
      },
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: earning.amount } },
    });
  }
}
