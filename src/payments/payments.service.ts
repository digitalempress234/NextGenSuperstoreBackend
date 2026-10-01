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
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { SettlementsService } from '../settlements/settlements.service';
import { CartService } from '../cart/cart.service';
import { PaystackClient } from './paystack.client';
import { kobo, money } from '../common/money';
import { NotificationsService } from '../notifications/notifications.service';

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
    private readonly notifications: NotificationsService,
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
        const paymentMetadata = group.payment.metadata as {
          initializingUntil?: number;
          transferInstructions?: unknown;
        } | null;
        if (
          group.payment.paymentUrl ||
          paymentMetadata?.transferInstructions ||
          group.payment.status === 'PAID'
        ) {
          return { payment: group.payment, initialize: false };
        }
        if ((paymentMetadata?.initializingUntil ?? 0) > Date.now()) {
          return { payment: group.payment, initialize: false };
        }
        const payment = await tx.payment.update({
          where: { id: group.payment.id },
          data: { metadata: { initializingUntil: Date.now() + 60000 } },
        });
        return { payment, initialize: true };
      }
      if (!['CARD', 'BANK_TRANSFER', 'OPAY'].includes(group.paymentMethod))
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
      if (payment.paymentMethod === 'BANK_TRANSFER') {
        const expiresAt = new Date(Date.now() + 30 * 60_000);
        const charge = await this.paystack.createBankTransferCharge(
          payment.transactionRef!,
          customer.email,
          payment.amount,
          expiresAt,
          { paymentGroupId, userId, purpose: 'ORDER_PAYMENT' },
        );
        if (charge.reference !== payment.transactionRef)
          throw new BadRequestException('Payment provider returned a different reference.');
        if (charge.status !== 'pending_bank_transfer')
          throw new BadRequestException('Paystack did not return transfer instructions.');
        const transferInstructions = {
          bankName: charge.bank.name,
          bankSlug: charge.bank.slug,
          accountName: charge.account_name,
          accountNumber: charge.account_number,
          amount: payment.amount.toFixed(2),
          currency: payment.currency,
          expiresAt: charge.account_expires_at,
          displayText: charge.display_text ?? 'Transfer the exact amount to this account.',
        };
        return this.prisma.payment.update({
          where: { id: payment.id },
          data: {
            providerRef: charge.reference,
            metadata: { transferInstructions },
          },
        });
      }
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

  async pendingCheckout(userId: number) {
    const group = await this.prisma.checkoutPaymentGroup.findFirst({
      where: { userId, status: { in: ['PENDING', 'PROCESSING'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!group) return null;
    return this.summary(userId, group.id);
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
    const paymentMetadata = group.payment?.metadata as {
      transferInstructions?: unknown;
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
      transferInstructions: paymentMetadata?.transferInstructions ?? null,
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
    const eventType = typeof event.event === 'string' ? event.event : 'unknown';
    const reference = typeof data?.reference === 'string' ? data.reference : undefined;
    const dataId = data?.id === undefined || data?.id === null ? undefined : String(data.id);
    const identity =
      reference ?? dataId ?? createHash('sha256').update(JSON.stringify(event)).digest('hex');
    const eventId = `${eventType}:${identity}`;
    const existing = await this.prisma.paymentWebhookEvent.findUnique({ where: { eventId } });
    if (existing?.processed) return { received: true };

    try {
      let paymentId: number | undefined;
      if (eventType === 'charge.success' && reference) {
        const known = await this.prisma.payment.findUnique({
          where: { transactionRef: reference },
        });
        if (known?.provider === 'PAYSTACK') {
          paymentId = known.id;
          const result = await this.verifyReference(reference);
          if (result.status !== 'PAID') {
            throw new ConflictException('Paystack charge.success did not verify as paid.');
          }
        } else {
          paymentId = await this.completeDedicatedAccountFunding(reference);
        }
      } else if (eventType === 'dedicatedaccount.assign.success') {
        await this.completeDedicatedAccountAssignment(data ?? {});
      } else if (eventType === 'dedicatedaccount.assign.failed') {
        await this.failDedicatedAccountAssignment(data ?? {});
      } else {
        return { received: true };
      }
      await this.prisma.paymentWebhookEvent.upsert({
        where: { eventId },
        create: {
          provider: 'PAYSTACK',
          eventId,
          eventType,
          payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
          processed: true,
          processedAt: new Date(),
          paymentId,
        },
        update: { processed: true, processedAt: new Date(), errorMessage: null, paymentId },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown webhook error';
      await this.prisma.paymentWebhookEvent.upsert({
        where: { eventId },
        create: {
          provider: 'PAYSTACK',
          eventId,
          eventType,
          payload: JSON.parse(JSON.stringify(event)) as Prisma.InputJsonValue,
          processed: false,
          errorMessage: message,
        },
        update: { processed: false, errorMessage: message },
      });
      throw error;
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
    if (payment.status === 'PAID') {
      await this.dispatchGroupConfirmations(payment.groups.map((group) => group.id));
      return { status: payment.status, paymentGroupId: payment.groups[0]?.id };
    }

    // ── Wallet top-up: no checkout group — route to dedicated handler ─────────
    const meta = payment.metadata as {
      purpose?: string;
      userId?: number;
      transferInstructions?: { expiresAt?: string };
    } | null;
    if (meta?.purpose === 'BNPL_REPAYMENT') {
      const repayment = await this.prisma.bnplRepayment.findUnique({ where: { reference } });
      if (!repayment) throw new NotFoundException('BNPL repayment not found.');
      const verified = await this.paystack.verify(reference);
      if (
        verified.reference !== reference ||
        verified.currency !== payment.currency ||
        typeof verified.amount !== 'number' ||
        verified.amount !== kobo(payment.amount)
      )
        throw new BadRequestException(
          'Payment reference, amount, or currency does not match repayment.',
        );
      if (verified.status !== 'success' && verified.status !== 'failed')
        return { status: payment.status, repaymentId: repayment.id };
      await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM BnplRepayment WHERE id = ${repayment.id} FOR UPDATE`,
        );
        const current = await tx.bnplRepayment.findUniqueOrThrow({ where: { id: repayment.id } });
        if (current.status === 'PAID' || current.status === 'FAILED') return;
        if (verified.status === 'success') await this.completeBnplRepayment(tx, current.id);
        else
          await tx.bnplRepayment.update({ where: { id: current.id }, data: { status: 'FAILED' } });
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: verified.status === 'success' ? 'PAID' : 'FAILED',
            paidAt: verified.status === 'success' ? new Date() : null,
          },
        });
      });
      return {
        status: verified.status === 'success' ? 'PAID' : 'FAILED',
        repaymentId: repayment.id,
      };
    }
    if (meta?.purpose === 'WALLET_TOPUP' || meta?.purpose === 'WALLET_TRANSFER_TOPUP') {
      const verified = await this.paystack.verify(reference);
      if (
        verified.reference !== reference ||
        verified.currency !== payment.currency ||
        typeof verified.amount !== 'number' ||
        verified.amount !== kobo(payment.amount)
      )
        throw new BadRequestException(
          'Payment reference, amount, or currency does not match top-up.',
        );
      if (verified.status !== 'success' && verified.status !== 'failed') {
        const expiresAt = meta.transferInstructions?.expiresAt;
        if (
          meta.purpose !== 'WALLET_TRANSFER_TOPUP' ||
          !expiresAt ||
          Date.now() <= new Date(expiresAt).getTime() + 10 * 60_000
        )
          return { status: payment.status, paymentGroupId: undefined };
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', failureReason: 'Bank transfer account expired.' },
        });
        return { status: 'FAILED', paymentGroupId: undefined };
      }
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
    let outcome = verified.status;
    if (outcome !== 'success' && outcome !== 'failed') {
      const transferMetadata = payment.metadata as {
        transferInstructions?: { expiresAt?: string };
      } | null;
      const expiresAt = transferMetadata?.transferInstructions?.expiresAt;
      const expired =
        payment.paymentMethod === 'BANK_TRANSFER' &&
        expiresAt &&
        Date.now() > new Date(expiresAt).getTime() + 10 * 60_000;
      if (!expired) return { status: payment.status, paymentGroupId: payment.groups[0]?.id };
      outcome = 'failed';
    }
    await this.prisma.$transaction(
      async (tx) => {
        for (const group of payment.groups) await this.cart.lock(tx, group.userId);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM Payment WHERE id = ${payment.id} FOR UPDATE`);
        const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
        if (current.status === 'PAID') return;
        if (current.status === 'FAILED' && outcome === 'success') {
          throw new ConflictException(
            'A released payment later succeeded; staff reconciliation is required.',
          );
        }
        if (current.status === 'FAILED') return;
        if (outcome === 'success') {
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
    if (outcome === 'success') {
      await this.dispatchGroupConfirmations(payment.groups.map((group) => group.id));
    }
    return {
      status: outcome === 'success' ? 'PAID' : 'FAILED',
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

  async topupWalletByTransfer(userId: number, amount: Prisma.Decimal) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const reference = `TOPUP-TRANSFER-${userId}-${randomUUID()}`;
    const payment = await this.prisma.payment.create({
      data: {
        amount,
        currency: 'NGN',
        paymentMethod: 'BANK_TRANSFER',
        provider: 'PAYSTACK',
        transactionRef: reference,
        metadata: { purpose: 'WALLET_TRANSFER_TOPUP', userId },
      },
    });
    try {
      const charge = await this.paystack.createBankTransferCharge(
        reference,
        user.email,
        amount,
        new Date(Date.now() + 30 * 60_000),
        { purpose: 'WALLET_TRANSFER_TOPUP', userId, paymentId: payment.id },
      );
      if (charge.reference !== reference || charge.status !== 'pending_bank_transfer') {
        throw new BadRequestException('Paystack did not return valid transfer instructions.');
      }
      const transferInstructions = {
        bankName: charge.bank.name,
        bankSlug: charge.bank.slug,
        accountName: charge.account_name,
        accountNumber: charge.account_number,
        amount: amount.toFixed(2),
        currency: 'NGN',
        expiresAt: charge.account_expires_at,
        displayText: charge.display_text ?? 'Transfer the exact amount to this account.',
      };
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerRef: charge.reference,
          metadata: { purpose: 'WALLET_TRANSFER_TOPUP', userId, transferInstructions },
        },
      });
      return {
        id: payment.id,
        transactionRef: reference,
        amount: amount.toFixed(2),
        currency: 'NGN',
        status: 'PENDING',
        paymentUrl: null,
        transferInstructions,
      };
    } catch (error) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: 'FAILED' },
      });
      throw error;
    }
  }

  async walletTransferAccount(userId: number) {
    const account = await this.prisma.walletFundingAccount.findUnique({ where: { userId } });
    if (!account) throw new NotFoundException('Wallet transfer account has not been requested.');
    return this.transferAccountResponse(account);
  }

  async createWalletTransferAccount(
    userId: number,
    input: {
      consent: true;
      preferredBank?: string;
    },
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.firstName || !user.lastName || !user.phoneNumber) {
      throw new BadRequestException(
        'First name, last name, and phone number are required before requesting a transfer account.',
      );
    }
    let account = await this.prisma.walletFundingAccount.findUnique({ where: { userId } });
    if (account?.status === 'ACTIVE' || account?.status === 'PENDING') {
      return this.transferAccountResponse(account);
    }
    try {
      let customerCode = account?.paystackCustomerCode;
      let customerId = account?.paystackCustomerId;
      if (!customerCode) {
        const customer =
          (await this.paystack.findCustomer(user.email)) ??
          (await this.paystack.createCustomer({
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phoneNumber,
            userId,
          }));
        customerCode = customer.customer_code;
        customerId = customer.id;
      }
      account = await this.prisma.walletFundingAccount.upsert({
        where: { userId },
        create: {
          userId,
          paystackCustomerCode: customerCode,
          paystackCustomerId: customerId,
          consentedAt: new Date(),
          status: 'PENDING',
        },
        update: {
          paystackCustomerCode: customerCode,
          paystackCustomerId: customerId,
          consentedAt: new Date(),
          status: 'PENDING',
          failureReason: null,
        },
      });
      const assignment = await this.paystack.assignDedicatedAccount({
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phoneNumber,
        preferredBank: input.preferredBank,
      });
      const immediate = this.dedicatedAccountFields(assignment);
      if (immediate.accountNumber) {
        account = await this.prisma.walletFundingAccount.update({
          where: { id: account.id },
          data: { ...immediate, status: 'ACTIVE', assignedAt: new Date() },
        });
      }
      return this.transferAccountResponse(account);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Paystack account assignment failed.';
      if (account) {
        await this.prisma.walletFundingAccount.update({
          where: { id: account.id },
          data: { status: 'FAILED', failureReason: message },
        });
      }
      throw error;
    }
  }

  async requeryWalletTransferAccount(userId: number) {
    const account = await this.prisma.walletFundingAccount.findUnique({ where: { userId } });
    if (!account?.accountNumber || !account.bankSlug || account.status !== 'ACTIVE') {
      throw new BadRequestException('An active wallet transfer account is required.');
    }
    await this.paystack.requeryDedicatedAccount(
      account.accountNumber,
      account.bankSlug,
      new Date().toISOString().slice(0, 10),
    );
    return { requested: true, message: 'Paystack is checking for delayed wallet transfers.' };
  }

  async initializeBnplRepayment(
    userId: number,
    installmentId: number,
    amount: Prisma.Decimal,
    method: 'wallet' | 'card',
  ) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const reference = `BNPL-REPAY-${installmentId}-${randomUUID()}`;
    if (method === 'wallet') {
      return this.prisma.$transaction(async (tx) => {
        const debit = await tx.wallet.updateMany({
          where: { userId, balance: { gte: amount } },
          data: { balance: { decrement: amount } },
        });
        if (!debit.count) throw new BadRequestException('Insufficient wallet balance.');
        const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount,
            type: 'DEBIT',
            reference,
            description: `BNPL installment ${installmentId}`,
          },
        });
        const repayment = await tx.bnplRepayment.create({
          data: { installmentId, userId, amount, method: 'WALLET', status: 'PENDING', reference },
        });
        await this.completeBnplRepayment(tx, repayment.id);
        return {
          repaymentId: repayment.id,
          status: 'paid',
          reference,
          paymentUrl: null,
          amount: amount.toFixed(2),
          currency: 'NGN',
        };
      });
    }
    const initialized = await this.paystack.initialize(
      reference,
      user.email,
      amount,
      undefined,
      ['card'],
      { purpose: 'BNPL_REPAYMENT', userId, installmentId },
    );
    const payment = await this.prisma.payment.create({
      data: {
        amount,
        currency: 'NGN',
        paymentMethod: 'CARD',
        provider: 'PAYSTACK',
        transactionRef: reference,
        paymentUrl: initialized.authorization_url,
        metadata: { purpose: 'BNPL_REPAYMENT', userId, installmentId },
      },
    });
    const repayment = await this.prisma.bnplRepayment.create({
      data: {
        installmentId,
        userId,
        amount,
        method: 'CARD',
        reference,
        paymentUrl: initialized.authorization_url,
      },
    });
    return {
      repaymentId: repayment.id,
      paymentId: payment.id,
      status: 'pending',
      reference,
      paymentUrl: initialized.authorization_url,
      amount: amount.toFixed(2),
      currency: 'NGN',
    };
  }

  private async completeBnplRepayment(tx: Prisma.TransactionClient, repaymentId: number) {
    const repayment = await tx.bnplRepayment.findUniqueOrThrow({
      where: { id: repaymentId },
      include: { installment: true },
    });
    if (repayment.status === 'PAID') return;
    const paid = repayment.installment.amountPaid.add(repayment.amount);
    await tx.bnplRepayment.update({
      where: { id: repayment.id },
      data: { status: 'PAID', paidAt: new Date() },
    });
    await tx.bnplInstallment.update({
      where: { id: repayment.installmentId },
      data: {
        amountPaid: paid,
        status: paid.gte(repayment.installment.amount) ? 'PAID' : 'PARTIALLY_PAID',
        paidAt: paid.gte(repayment.installment.amount) ? new Date() : null,
      },
    });
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

  async walletTransactions(userId: number, page = 1, limit = 15) {
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return { balance: 0, currency: 'NGN', items: [], total: 0, page, limit, pages: 0 };
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

  async requestWalletWithdrawal(
    userId: number,
    input: {
      amount: number;
      bankName: string;
      accountNumber: string;
      accountName: string;
      mode: 'MANUAL';
    },
  ) {
    const amount = money(input.amount);
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Wallet WHERE userId = ${userId} FOR UPDATE`;
      const wallet = await tx.wallet.findUnique({ where: { userId } });
      if (!wallet || wallet.balance.lt(amount))
        throw new BadRequestException('Insufficient wallet balance.');
      const reference = `CW-${userId}-${randomUUID()}`;
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: amount } },
      });
      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          amount,
          type: 'DEBIT',
          reference,
          description: 'Customer wallet withdrawal request',
        },
      });
      return tx.withdrawal.create({
        data: {
          userId,
          amount,
          mode: input.mode,
          bankName: input.bankName.trim(),
          accountNumber: input.accountNumber.trim(),
          accountName: input.accountName.trim(),
        },
      });
    });
  }

  async walletWithdrawals(userId: number, page = 1, limit = 15) {
    const [items, total] = await Promise.all([
      this.prisma.withdrawal.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.withdrawal.count({ where: { userId } }),
    ]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
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
      await tx.orderConfirmationOutbox.upsert({
        where: { orderId: order.id },
        update: {},
        create: { orderId: order.id, userId: group.userId },
      });
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
      const appliedVoucher = tx.cartVoucher
        ? await tx.cartVoucher.findUnique({ where: { cartId: activeCart.id } })
        : null;
      if (appliedVoucher) {
        await tx.userVoucher.updateMany({
          where: { userId: group.userId, voucherId: appliedVoucher.voucherId, status: 'CLAIMED' },
          data: { status: 'REDEEMED', redeemedAt: new Date() },
        });
        await tx.cartVoucher.delete({ where: { cartId: activeCart.id } });
      }
      const appliedCoupon = tx.cartCoupon
        ? await tx.cartCoupon.findUnique({ where: { cartId: activeCart.id } })
        : null;
      if (appliedCoupon) {
        await tx.coupon.update({
          where: { id: appliedCoupon.couponId },
          data: { usedCount: { increment: 1 } },
        });
        await tx.cartCoupon.delete({ where: { cartId: activeCart.id } });
      }
    }
    await tx.checkoutPaymentGroup.update({
      where: { id },
      data: { status: 'PAID', activeCartId: null },
    });
  }

  async dispatchGroupConfirmations(groupIds: number[]) {
    if (!groupIds.length) return { processed: 0, failed: 0 };
    const allocations = await this.prisma.checkoutPaymentAllocation.findMany({
      where: { paymentGroupId: { in: groupIds } },
      select: { orderId: true },
    });
    return this.notifications.processOrderConfirmations(
      allocations.map((allocation) => allocation.orderId),
    );
  }

  private transferAccountResponse(account: {
    status: string;
    bankName: string | null;
    bankSlug: string | null;
    accountName: string | null;
    accountNumber: string | null;
    currency: string;
    assignedAt: Date | null;
    failureReason: string | null;
  }) {
    return {
      status: account.status.toLowerCase(),
      bankName: account.bankName,
      bankSlug: account.bankSlug,
      accountName: account.accountName,
      accountNumber: account.accountNumber,
      currency: account.currency,
      assignedAt: account.assignedAt,
      failureReason: account.status === 'FAILED' ? account.failureReason : null,
    };
  }

  private dedicatedAccountFields(data: Record<string, unknown>) {
    const nested = data.dedicated_account;
    const account =
      nested && typeof nested === 'object' ? (nested as Record<string, unknown>) : data;
    const bank =
      account.bank && typeof account.bank === 'object'
        ? (account.bank as Record<string, unknown>)
        : {};
    return {
      providerAccountId:
        typeof account.id === 'number' ? account.id : Number(account.id) || undefined,
      bankName: typeof bank.name === 'string' ? bank.name : undefined,
      bankSlug: typeof bank.slug === 'string' ? bank.slug : undefined,
      accountName: typeof account.account_name === 'string' ? account.account_name : undefined,
      accountNumber:
        typeof account.account_number === 'string' ? account.account_number : undefined,
      currency: typeof account.currency === 'string' ? account.currency : 'NGN',
    };
  }

  private dedicatedAccountCustomer(data: Record<string, unknown>) {
    if (data.customer && typeof data.customer === 'object') {
      return data.customer as Record<string, unknown>;
    }
    const nested = data.dedicated_account;
    if (nested && typeof nested === 'object') {
      const customer = (nested as Record<string, unknown>).customer;
      if (customer && typeof customer === 'object') return customer as Record<string, unknown>;
    }
    return {};
  }

  private async completeDedicatedAccountAssignment(data: Record<string, unknown>) {
    const fields = this.dedicatedAccountFields(data);
    const customer = this.dedicatedAccountCustomer(data);
    const customerCode =
      typeof customer.customer_code === 'string'
        ? customer.customer_code
        : typeof data.customer_code === 'string'
          ? data.customer_code
          : undefined;
    const email =
      typeof customer.email === 'string'
        ? customer.email
        : typeof data.email === 'string'
          ? data.email
          : undefined;
    const account = await this.prisma.walletFundingAccount.findFirst({
      where: {
        OR: [
          ...(customerCode ? [{ paystackCustomerCode: customerCode }] : []),
          ...(email ? [{ user: { email } }] : []),
        ],
      },
    });
    if (!account) throw new NotFoundException('Wallet transfer account assignment was not found.');
    await this.prisma.walletFundingAccount.update({
      where: { id: account.id },
      data: {
        ...fields,
        paystackCustomerCode: customerCode ?? account.paystackCustomerCode,
        status: 'ACTIVE',
        assignedAt: new Date(),
        failureReason: null,
      },
    });
  }

  private async failDedicatedAccountAssignment(data: Record<string, unknown>) {
    const customer = this.dedicatedAccountCustomer(data);
    const customerCode =
      typeof customer.customer_code === 'string'
        ? customer.customer_code
        : typeof data.customer_code === 'string'
          ? data.customer_code
          : undefined;
    const email =
      typeof customer.email === 'string'
        ? customer.email
        : typeof data.email === 'string'
          ? data.email
          : undefined;
    const reason =
      typeof data.message === 'string' ? data.message : 'Paystack could not assign the account.';
    const account = await this.prisma.walletFundingAccount.findFirst({
      where: {
        OR: [
          ...(customerCode ? [{ paystackCustomerCode: customerCode }] : []),
          ...(email ? [{ user: { email } }] : []),
        ],
      },
    });
    if (!account) throw new NotFoundException('Wallet transfer account assignment was not found.');
    await this.prisma.walletFundingAccount.update({
      where: { id: account.id },
      data: { status: 'FAILED', failureReason: reason },
    });
  }

  private async completeDedicatedAccountFunding(reference: string) {
    const verified = await this.paystack.verify(reference);
    if (
      verified.status !== 'success' ||
      verified.reference !== reference ||
      verified.currency !== 'NGN' ||
      typeof verified.amount !== 'number' ||
      verified.amount <= 0
    ) {
      throw new BadRequestException('Invalid dedicated-account transfer confirmation.');
    }
    const customer =
      verified.customer && typeof verified.customer === 'object'
        ? (verified.customer as Record<string, unknown>)
        : {};
    const authorization =
      verified.authorization && typeof verified.authorization === 'object'
        ? (verified.authorization as Record<string, unknown>)
        : {};
    if (authorization.channel !== 'dedicated_nuban') {
      throw new BadRequestException('The transfer is not a dedicated-account wallet payment.');
    }
    const customerCode =
      typeof customer.customer_code === 'string' ? customer.customer_code : undefined;
    const receiverAccount =
      typeof authorization.receiver_bank_account_number === 'string'
        ? authorization.receiver_bank_account_number
        : undefined;
    const fundingAccount = await this.prisma.walletFundingAccount.findFirst({
      where: {
        status: 'ACTIVE',
        OR: [
          ...(customerCode ? [{ paystackCustomerCode: customerCode }] : []),
          ...(receiverAccount ? [{ accountNumber: receiverAccount }] : []),
        ],
      },
    });
    if (!fundingAccount) throw new NotFoundException('Receiving wallet account was not found.');
    const amount = new Prisma.Decimal(verified.amount).div(100).toDecimalPlaces(2);
    const payment = await this.prisma.payment.upsert({
      where: { transactionRef: reference },
      update: {},
      create: {
        amount,
        currency: 'NGN',
        paymentMethod: 'BANK_TRANSFER',
        provider: 'PAYSTACK',
        transactionRef: reference,
        providerRef: String(verified.id ?? reference),
        metadata: {
          purpose: 'WALLET_DVA_TOPUP',
          userId: fundingAccount.userId,
          channel: 'dedicated_nuban',
        },
      },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM Payment WHERE id = ${payment.id} FOR UPDATE`);
      const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      if (current.status === 'PAID') return;
      const wallet = await tx.wallet.upsert({
        where: { userId: fundingAccount.userId },
        create: { userId: fundingAccount.userId },
        update: {},
      });
      const ledgerReference = `DVA-CREDIT-${reference}`;
      const priorCredit = await tx.walletTransaction.findUnique({
        where: { reference: ledgerReference },
      });
      if (!priorCredit) {
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: { increment: amount } },
        });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            amount,
            type: 'CREDIT',
            reference: ledgerReference,
            description: 'Wallet funding via bank transfer',
          },
        });
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'PAID', paidAt: new Date() },
      });
      await tx.notification.upsert({
        where: { eventKey: `wallet-funded:${reference}` },
        update: {},
        create: {
          eventKey: `wallet-funded:${reference}`,
          recipientId: fundingAccount.userId,
          type: 'PAYMENT_RECEIVED',
          title: 'Wallet funded',
          message: `₦${amount.toNumber().toLocaleString('en-NG', { minimumFractionDigits: 2 })} has been added to your wallet.`,
          data: { paymentId: payment.id, amount: amount.toFixed(2), method: 'bank_transfer' },
        },
      });
    });
    return payment.id;
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
