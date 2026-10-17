import { Prisma, type OrderStatus } from '@prisma/client';

type CompletableOrder = {
  id: number;
  userId: number;
  subtotal: Prisma.Decimal;
  total: Prisma.Decimal;
  currentStatus: OrderStatus;
};

export async function completeOrder(
  tx: Prisma.TransactionClient,
  order: CompletableOrder,
  changedById: number | undefined,
  reason: string,
) {
  await tx.order.update({
    where: { id: order.id },
    data: { currentStatus: 'COMPLETED' },
  });
  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: order.currentStatus,
      toStatus: 'COMPLETED',
      changedById,
      reason,
    },
  });

  const rateRow = await tx.platformConfig.findUnique({ where: { key: 'cashback_rate' } });
  const percentage = new Prisma.Decimal(rateRow?.value ?? '1');
  let cashbackAmount = new Prisma.Decimal(0);
  if (percentage.gt(0) && percentage.lte(100)) {
    cashbackAmount = order.subtotal.mul(percentage).div(100).toDecimalPlaces(2);
    await tx.cashbackReward.upsert({
      where: { orderId: order.id },
      update: {},
      create: {
        userId: order.userId,
        orderId: order.id,
        percentage,
        amount: cashbackAmount,
      },
    });
  }

  const points = Math.floor(order.total.toNumber() / 1000);
  await tx.rewardAccount.upsert({
    where: { userId: order.userId },
    create: { userId: order.userId, availablePoints: points },
    update: { availablePoints: { increment: points } },
  });

  const referral = await tx.referral.findUnique({ where: { referredUserId: order.userId } });
  if (referral?.status === 'PENDING') {
    const rewardRow = await tx.platformConfig.findUnique({
      where: { key: 'referral_reward_amount' },
    });
    await tx.referral.update({
      where: { id: referral.id },
      data: {
        status: 'QUALIFIED',
        qualifiedAt: new Date(),
        rewardAmount: new Prisma.Decimal(rewardRow?.value ?? '1000'),
      },
    });
  }

  return { cashbackAmount: cashbackAmount.toFixed(2), points };
}
