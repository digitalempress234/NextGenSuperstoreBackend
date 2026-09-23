import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementsService } from '../settlements/settlements.service';
import { CartService } from '../cart/cart.service';
import { PaystackClient } from './paystack.client';
import { kobo, money } from '../common/money';

type CartSnapshotLine = { cartItemId: number; quantity: number };

@Injectable()
export class PaymentsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentsService.name);
  private reconciliationTimer?: NodeJS.Timeout;
  private reconciling = false;
  constructor(
    private readonly prisma: PrismaService,
    private readonly paystack: PaystackClient,
    private readonly settlements: SettlementsService,
    private readonly cart: CartService,
  ) {}

  onModuleInit() {
    // An uncertain provider response must be checked with Paystack before releasing stock.
    this.reconciliationTimer = setInterval(
      () => {
        void this.reconcilePending().catch((error: unknown) =>
          this.logger.error('Payment reconciliation failed', error),
        );
      },
      5 * 60 * 1000,
    );
    this.reconciliationTimer.unref();
  }

  onModuleDestroy() {
    if (this.reconciliationTimer) clearInterval(this.reconciliationTimer);
  }

  async reconcilePending() {
    if (this.reconciling) return { checked: 0, paid: 0, failed: 0, pending: 0, errors: 0 };
    this.reconciling = true;
    const counts = { checked: 0, paid: 0, failed: 0, pending: 0, errors: 0 };
    try {
      const payments = await this.prisma.payment.findMany({
        where: {
          provider: 'PAYSTACK',
          status: 'PENDING',
          transactionRef: { not: null },
          createdAt: { lt: new Date(Date.now() - 2 * 60 * 1000) },
          groups: { some: { status: { in: ['PENDING', 'PROCESSING'] } } },
        },
        select: { transactionRef: true },
        orderBy: { createdAt: 'asc' },
        take: 50,
      });
      for (const payment of payments) {
        if (!payment.transactionRef) continue;
        counts.checked++;
        try {
          const result = await this.verifyReference(payment.transactionRef);
          if (result.status === 'PAID') counts.paid++;
          else if (result.status === 'FAILED') counts.failed++;
          else counts.pending++;
        } catch (error) {
          counts.errors++;
          this.logger.error(`Could not reconcile payment ${payment.transactionRef}`, error);
        }
      }
      return counts;
    } finally {
      this.reconciling = false;
    }
  }

  async redirectOrderId(paymentGroupId: number | undefined) {
    if (!paymentGroupId) return undefined;
    const allocation = await this.prisma.checkoutPaymentAllocation.findFirst({
      where: { paymentGroupId },
      orderBy: { id: 'asc' },
      select: { orderId: true },
    });
    return allocation?.orderId;
  }

  async initialize(userId: number, paymentGroupId: number) {
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM CheckoutPaymentGroup WHERE id = ${paymentGroupId} FOR UPDATE`,
      );
      const group = await tx.checkoutPaymentGroup.findFirst({
        where: { id: paymentGroupId, userId },
        include: { payment: true },
      });
      if (!group) throw new NotFoundException('Checkout payment group not found.');
      if (group.status === 'FAILED')
        throw new ConflictException('Checkout failed. Start a new checkout.');
      if (group.payment) {
        if (group.payment.paymentUrl || group.payment.status === 'PAID') {
          return { payment: group.payment, initialize: false };
        }
        const metadata = group.payment.metadata as { initializingUntil?: number } | null;
        if ((metadata?.initializingUntil ?? 0) > Date.now()) {
          return { payment: group.payment, initialize: false };
        }
        const payment = await tx.payment.update({
          where: { id: group.payment.id },
          data: { metadata: { initializingUntil: Date.now() + 60000 } },
        });
        return { payment, initialize: true };
      }
      if (!['CARD', 'OPAY'].includes(group.paymentMethod))
        throw new BadRequestException('Checkout does not use Paystack.');
      const payment = await tx.payment.create({
        data: {
          amount: group.totalAmount,
          currency: group.currency,
          paymentMethod: group.paymentMethod,
          provider: 'PAYSTACK',
          transactionRef: 'PUR-' + group.id + '-' + randomUUID(),
          metadata: { initializingUntil: Date.now() + 60000 },
        },
      });
      await tx.checkoutPaymentGroup.update({
        where: { id: group.id },
        data: { paymentId: payment.id, status: 'PROCESSING' },
      });
      return { payment, initialize: true };
    });
    const payment = claim.payment;
    if (!claim.initialize) return payment;
    const customer = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    // The reference is saved before the network call. Every retry uses this same reference.
    try {
      const initialized = await this.paystack.initialize(
        payment.transactionRef!,
        customer.email,
        payment.amount,
        undefined,
        payment.paymentMethod === 'OPAY' ? ['bank'] : ['card'],
        { paymentGroupId, userId },
      );
      if (initialized.reference !== payment.transactionRef)
        throw new BadRequestException('Payment provider returned a different reference.');
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerRef: initialized.reference,
          paymentUrl: initialized.authorization_url,
          metadata: {},
        },
      });
    } catch (error) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { metadata: {} } });
      throw error;
    }
  }

  async summary(userId: number, id: number) {
    const group = await this.prisma.checkoutPaymentGroup.findFirst({
      where: { id, userId },
      include: {
        payment: true,
        allocations: { include: { order: { include: { items: true, pickup: true } } } },
      },
    });
    if (!group) throw new NotFoundException('Checkout payment group not found.');
    const orders = group.allocations.map((allocation) => allocation.order);
    const snapshot = group.checkoutSnapshot as {
      quote?: { deliveryAddress?: unknown; pickupStation?: unknown; fulfillmentType?: string };
    } | null;
    return {
      paymentGroup: {
        id: group.id,
        totalAmount: group.totalAmount,
        currency: group.currency,
        status: group.status,
      },
      paymentGroupId: group.id,
      orderId: orders[0]?.id,
      orderNumber: orders[0]?.orderNumber,
      orders,
      paymentStatus: group.status.toLowerCase(),
      paymentMethod: group.paymentMethod.toLowerCase(),
      deliveryAddress: snapshot?.quote?.deliveryAddress ?? null,
      pickupStation: snapshot?.quote?.pickupStation ?? null,
      deliveryMethod:
        snapshot?.quote?.fulfillmentType === 'DELIVERY' ? 'home_delivery' : 'store_pickup',
      paymentReference: group.payment?.transactionRef ?? null,
      paymentUrl: group.payment?.paymentUrl ?? null,
      subtotal: orders.reduce((sum, order) => sum.add(order.subtotal), new Prisma.Decimal(0)),
      shippingFee: orders.reduce((sum, order) => sum.add(order.shippingFee), new Prisma.Decimal(0)),
      tax: orders.reduce((sum, order) => sum.add(order.taxAmount), new Prisma.Decimal(0)),
      total: group.totalAmount,
      currency: group.currency,
      createdAt: group.createdAt,
    };
  }

  async status(userId: number, groupId: number, verify = false) {
    const group = await this.prisma.checkoutPaymentGroup.findFirst({
      where: { id: groupId, userId },
      include: { payment: true },
    });
    if (!group) throw new NotFoundException('Checkout payment group not found.');
    if (
      verify &&
      group.payment?.provider === 'PAYSTACK' &&
      group.payment.transactionRef &&
      group.status !== 'PAID'
    ) {
      await this.verifyReference(group.payment.transactionRef);
    }
    return this.summary(userId, groupId);
  }

  async handleWebhook(event: Record<string, unknown>) {
    const data = event.data as Record<string, unknown> | undefined;
    if (event.event !== 'charge.success' || typeof data?.reference !== 'string')
      return { received: true };
    const reference = data.reference;
    const known = await this.prisma.payment.findUnique({ where: { transactionRef: reference } });
    if (!known || known.provider !== 'PAYSTACK') return { received: true };
    const eventId = 'charge.success:' + reference;
    const existing = await this.prisma.paymentWebhookEvent.findUnique({ where: { eventId } });
    if (existing?.processed) return { received: true };
    const result = await this.verifyReference(reference);
    if (result.status === 'PAID') {
      await this.prisma.paymentWebhookEvent.upsert({
        where: { eventId },
        create: {
          provider: 'PAYSTACK',
          eventId,
          eventType: 'charge.success',
          payload: { reference },
          processed: true,
          processedAt: new Date(),
        },
        update: { processed: true, processedAt: new Date() },
      });
    }
    return { received: true };
  }

  async verifyReference(reference: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { transactionRef: reference },
      include: { groups: true },
    });
    if (!payment || payment.provider !== 'PAYSTACK')
      throw new NotFoundException('Payment not found.');
    if (payment.status === 'PAID')
      return { status: payment.status, paymentGroupId: payment.groups[0]?.id };

    // ── Wallet top-up: no checkout group — route to dedicated handler ─────────
    const meta = payment.metadata as { purpose?: string; userId?: number } | null;
    if (meta?.purpose === 'WALLET_TOPUP') {
      const verified = await this.paystack.verify(reference);
      if (verified.reference !== reference || verified.currency !== payment.currency)
        throw new BadRequestException('Payment reference or currency does not match top-up.');
      if (verified.status !== 'success' && verified.status !== 'failed')
        return { status: payment.status, paymentGroupId: undefined };
      if (verified.status === 'success') {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT id FROM Payment WHERE id = ${payment.id} FOR UPDATE`,
          );
          const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
          if (current.status === 'PAID') return;
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'PAID', paidAt: new Date() },
          });
          await this.completeWalletTopup(tx, payment.id, meta.userId!, payment.amount);
        });
        return { status: 'PAID', paymentGroupId: undefined };
      }
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      return { status: 'FAILED', paymentGroupId: undefined };
    }

    // ── Standard checkout payment ─────────────────────────────────────────────
    const verified = await this.paystack.verify(reference);
    if (
      verified.reference !== reference ||
      verified.currency !== payment.currency ||
      typeof verified.amount !== 'number' ||
      verified.amount !== kobo(payment.amount)
    ) {
      throw new BadRequestException(
        'Payment reference, amount, or currency does not match checkout.',
      );
    }
    if (verified.status !== 'success' && verified.status !== 'failed') {
      return { status: payment.status, paymentGroupId: payment.groups[0]?.id };
    }
    await this.prisma.$transaction(
      async (tx) => {
        for (const group of payment.groups) await this.cart.lock(tx, group.userId);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM Payment WHERE id = ${payment.id} FOR UPDATE`);
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status === 'PAID') return;
        if (current.status === 'FAILED' && verified.status === 'success') {
          throw new ConflictException(
            'A released payment later succeeded; staff reconciliation is required.',
          );
        }
        if (current.status === 'FAILED') return;
        if (verified.status === 'success') {
          await tx.payment.update({
            where: { id: payment.id },
            data: { status: 'PAID', paidAt: new Date() },
          });
          for (const group of payment.groups) await this.completeGroup(tx, group.id);
        } else {
          await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
          for (const group of payment.groups) await this.failGroup(tx, group.id);
        }
      },
      { timeout: 15000 },
    );
    return {
      status: verified.status === 'success' ? 'PAID' : 'FAILED',
      paymentGroupId: payment.groups[0]?.id,
    };
  }

  // ── Wallet top-up ─────────────────────────────────────────────────────────────

  async topupWallet(userId: number, amount: Prisma.Decimal) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const reference = 'TOPUP-' + userId + '-' + randomUUID();
    const payment = await this.prisma.payment.create({
      data: {
        amount,
        currency: 'NGN',
        paymentMethod: 'CARD',
        provider: 'PAYSTACK',
        transactionRef: reference,
        metadata: { purpose: 'WALLET_TOPUP', userId, initializingUntil: Date.now() + 60000 },
      },
    });
    try {
      const initialized = await this.paystack.initialize(
        reference,
        user.email,
        amount,
        undefined,
        ['card'],
        { purpose: 'WALLET_TOPUP', userId },
      );
      return this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerRef: initialized.reference,
          paymentUrl: initialized.authorization_url,
          metadata: { purpose: 'WALLET_TOPUP', userId },
        },
        select: {
          id: true,
          transactionRef: true,
          paymentUrl: true,
          amount: true,
          currency: true,
          status: true,
        },
      });
    } catch (error) {
      await this.prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
      throw error;
    }
  }

  private async completeWalletTopup(
    tx: Prisma.TransactionClient,
    paymentId: number,
    userId: number,
    amount: Prisma.Decimal,
  ) {
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
        reference: 'TOPUP-CREDIT-' + paymentId,
        description: 'Wallet top-up via Paystack',
      },
    });
    await tx.notification.create({
      data: {
        recipientId: userId,
        type: 'PAYMENT_RECEIVED',
        title: 'Wallet funded',
        message: `\u20a6${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })} has been added to your wallet.`,
        data: { paymentId, amount: amount.toFixed(2) },
      },
    });
  }

  async walletTransactions(userId: number, page = 1, limit = 20) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet)
      return { balance: 0, currency: 'NGN', items: [], total: 0, page, limit, pages: 0 };
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
    return {
      balance: wallet.balance,
      currency: 'NGN',
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async completeGroup(tx: Prisma.TransactionClient, id: number) {
    const group = await tx.checkoutPaymentGroup.findUniqueOrThrow({
      where: { id },
      include: { allocations: { include: { order: true } } },
    });
    if (group.status === 'PAID') return;
    if (group.status === 'FAILED') throw new ConflictException('Cannot pay a released checkout.');
    for (const { order } of group.allocations) {
      if (order.currentStatus !== 'ORDER_RECEIVED')
        throw new ConflictException('Order is no longer payable.');
      await tx.order.update({ where: { id: order.id }, data: { currentStatus: 'CONFIRMED' } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'ORDER_RECEIVED',
          toStatus: 'CONFIRMED',
          reason: 'Payment or approved financing confirmed.',
        },
      });
      await this.settlements.settleOrder(order.id, tx);
    }
    const activeCart = await tx.cart.findUnique({ where: { userId: group.userId } });
    if (activeCart && Array.isArray(group.cartSnapshot)) {
      for (const line of group.cartSnapshot as unknown as CartSnapshotLine[]) {
        const item = await tx.cartItem.findFirst({
          where: { id: line.cartItemId, cartId: activeCart.id },
        });
        if (!item) continue;
        if (item.quantity <= line.quantity) await tx.cartItem.delete({ where: { id: item.id } });
        else
          await tx.cartItem.update({
            where: { id: item.id },
            data: { quantity: { decrement: line.quantity } },
          });
      }
      await this.cart.recalculate(tx, activeCart.id);
    }
    await tx.checkoutPaymentGroup.update({
      where: { id },
      data: { status: 'PAID', activeCartId: null },
    });
    await tx.notification.create({
      data: {
        recipientId: group.userId,
        type: 'PAYMENT_RECEIVED',
        title: 'Order confirmed',
        message: 'Payment for checkout ' + id + ' was confirmed.',
        data: { paymentGroupId: id },
      },
    });
  }

  async failGroup(tx: Prisma.TransactionClient, id: number) {
    const group = await tx.checkoutPaymentGroup.findUniqueOrThrow({
      where: { id },
      include: { allocations: { include: { order: { include: { items: true } } } } },
    });
    if (group.status === 'FAILED') return;
    if (group.status === 'PAID')
      throw new ConflictException('Paid checkouts require the refund workflow.');
    for (const { order } of group.allocations) {
      if (order.currentStatus !== 'ORDER_RECEIVED')
        throw new ConflictException('Order cannot be released automatically.');
      for (const item of order.items)
        await tx.storeProduct.update({
          where: { id: item.storeProductId },
          data: { stockQuantity: { increment: item.quantity } },
        });
      await tx.order.update({ where: { id: order.id }, data: { currentStatus: 'CANCELLED' } });
      await tx.delivery.updateMany({ where: { orderId: order.id }, data: { status: 'CANCELLED' } });
      await tx.pickup.updateMany({ where: { orderId: order.id }, data: { status: 'cancelled' } });
      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          fromStatus: 'ORDER_RECEIVED',
          toStatus: 'CANCELLED',
          reason: 'Payment failed or unpaid checkout cancelled.',
        },
      });
    }
    await tx.checkoutPaymentGroup.update({
      where: { id },
      data: { status: 'FAILED', activeCartId: null },
    });
  }

  async cancel(userId: number, id: number) {
    await this.prisma.$transaction(async (tx) => {
      await this.cart.lock(tx, userId);
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM CheckoutPaymentGroup WHERE id = ${id} FOR UPDATE`,
      );
      const group = await tx.checkoutPaymentGroup.findFirst({ where: { id, userId } });
      if (!group) throw new NotFoundException('Checkout not found.');
      if (group.paymentId)
        throw new ConflictException(
          'An initialized payment must be verified before stock can be released.',
        );
      await this.failGroup(tx, id);
    });
    return this.summary(userId, id);
  }
}
