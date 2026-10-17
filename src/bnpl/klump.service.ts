import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KlumpTransactionStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';

import { CheckoutService } from '../checkout/checkout.service';
import { jsonSnapshot } from '../checkout/checkout.service';
import { PaymentsService } from '../payments/payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { InitializeKlumpCheckoutDto } from './dto/klump.dto';
import { KlumpClient } from './klump.client';

type KlumpData = Record<string, unknown>;

@Injectable()
export class KlumpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly checkout: CheckoutService,
    private readonly payments: PaymentsService,
    private readonly client: KlumpClient,
    private readonly config: ConfigService,
  ) {}

  async initialize(userId: number, input: InitializeKlumpCheckoutDto) {
    this.configuration();
    const checkout = await this.checkout.create(userId, {
      ...input,
      paymentMethod: 'klump_bnpl',
    });
    const paymentGroupId = checkout.paymentGroupId as number;

    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM CheckoutPaymentGroup WHERE id = ${paymentGroupId} FOR UPDATE`,
      );
      const group = await tx.checkoutPaymentGroup.findFirst({
        where: { id: paymentGroupId, userId },
        include: {
          user: true,
          payment: true,
          klumpTransaction: true,
          allocations: {
            include: {
              order: { include: { store: true, items: { orderBy: { id: 'asc' } } } },
            },
          },
        },
      });
      if (!group) throw new NotFoundException('Checkout payment group was not found.');
      if (group.paymentMethod !== 'KLUMP_BNPL') {
        throw new ConflictException('The active checkout uses a different payment method.');
      }
      if (group.status === 'FAILED') throw new ConflictException('Checkout has already failed.');
      if (group.klumpTransaction) return group.klumpTransaction;
      if (group.payment && group.payment.provider !== 'KLUMP') {
        throw new ConflictException('Checkout has already been initialized with another provider.');
      }

      const payload = this.checkoutPayload(group);
      const merchantReference = `PURSE-KLUMP-${group.id}-${randomUUID()}`;
      const payment =
        group.payment ??
        (await tx.payment.create({
          data: {
            amount: group.totalAmount,
            currency: group.currency,
            paymentMethod: 'KLUMP_BNPL',
            provider: 'KLUMP',
            transactionRef: merchantReference,
            metadata: { purpose: 'KLUMP_CHECKOUT', paymentGroupId: group.id, userId },
          },
        }));
      await tx.checkoutPaymentGroup.update({
        where: { id: group.id },
        data: { paymentId: payment.id, status: 'PROCESSING' },
      });
      return tx.klumpTransaction.create({
        data: {
          userId,
          paymentGroupId: group.id,
          paymentId: payment.id,
          merchantReference,
          status: 'PENDING',
          isLive: this.isLive(),
          checkoutPayload: jsonSnapshot({
            ...payload,
            merchant_reference: merchantReference,
            meta_data: {
              ...payload.meta_data,
              merchant_reference: merchantReference,
            },
          }),
        },
      });
    });

    return this.presentInitialization(transaction);
  }

  async verify(userId: number, reference: string) {
    const result = await this.verifyProviderTransaction(reference, userId);
    return {
      transaction: await this.statusById(userId, result.transactionId),
      checkout: await this.payments.summary(userId, result.paymentGroupId),
    };
  }

  async status(userId: number, merchantReference: string) {
    const transaction = await this.prisma.klumpTransaction.findFirst({
      where: { merchantReference, userId },
    });
    if (!transaction) throw new NotFoundException('Klump checkout was not found.');
    return this.statusById(userId, transaction.id);
  }

  async handleWebhook(
    webhookId: string,
    attempt: string | undefined,
    event: Record<string, unknown>,
  ) {
    const eventType = typeof event.event === 'string' ? event.event : 'unknown';
    const eventId = `KLUMP:${webhookId}`;
    const existing = await this.prisma.paymentWebhookEvent.findUnique({ where: { eventId } });
    if (existing?.processed) return { received: true, duplicate: true };
    await this.prisma.paymentWebhookEvent.upsert({
      where: { eventId },
      create: {
        provider: 'KLUMP',
        eventId,
        eventType,
        payload: jsonSnapshot({ ...event, webhookAttempt: attempt ?? null }),
      },
      update: {},
    });

    try {
      const data = this.data(event);
      let paymentId: number | undefined;
      if (eventType === 'klump.payment.transaction.successful') {
        const reference = this.providerReference(data);
        if (!reference) throw new BadRequestException('Klump webhook reference is missing.');
        const verified = await this.verifyProviderTransaction(reference);
        paymentId = verified.paymentId;
      } else if (
        eventType === 'klump.payment.transaction.initiated' ||
        eventType === 'klump.payment.transaction.abandoned'
      ) {
        const merchantReference = this.merchantReference(data);
        const transaction = merchantReference
          ? await this.prisma.klumpTransaction.findUnique({ where: { merchantReference } })
          : null;
        if (transaction) {
          paymentId = transaction.paymentId;
          const providerReference = this.providerReference(data);
          await this.prisma.klumpTransaction.update({
            where: { id: transaction.id },
            data: {
              status:
                eventType === 'klump.payment.transaction.abandoned' ? 'ABANDONED' : 'INITIATED',
              ...(providerReference ? { providerReference } : {}),
              providerPayload: jsonSnapshot(data),
            },
          });
        }
      }
      await this.prisma.paymentWebhookEvent.update({
        where: { eventId },
        data: { processed: true, processedAt: new Date(), errorMessage: null, paymentId },
      });
      return { received: true };
    } catch (error) {
      await this.prisma.paymentWebhookEvent.update({
        where: { eventId },
        data: {
          processed: false,
          errorMessage: error instanceof Error ? error.message : 'Unknown Klump webhook error.',
        },
      });
      throw error;
    }
  }

  async resendWebhook(actorId: number, reference: string) {
    const result = await this.client.resendWebhook(reference);
    await this.prisma.auditLog.create({
      data: {
        staffActorId: actorId,
        action: 'KLUMP_WEBHOOK_RESEND_REQUESTED',
        entity: 'KlumpTransaction',
        entityId: reference,
      },
    });
    return result;
  }

  private async verifyProviderTransaction(reference: string, expectedUserId?: number) {
    const response = await this.client.verify(reference);
    if (response.state !== 'success' || !response.data) {
      throw new BadGatewayException(response.message || 'Klump verification did not succeed.');
    }
    const data = response.data;
    const merchantReference = this.merchantReference(data);
    const returnedReference = this.providerReference(data);
    const transaction = await this.prisma.klumpTransaction.findFirst({
      where: {
        OR: [
          ...(merchantReference ? [{ merchantReference }] : []),
          ...(returnedReference ? [{ providerReference: returnedReference }] : []),
        ],
      },
      include: { payment: true, paymentGroup: true },
    });
    if (!transaction) throw new NotFoundException('Klump transaction does not match a checkout.');
    if (expectedUserId !== undefined && transaction.userId !== expectedUserId) {
      throw new ForbiddenException('Klump transaction does not belong to this customer.');
    }
    if (!merchantReference || merchantReference !== transaction.merchantReference) {
      throw new BadRequestException('Klump merchant reference does not match checkout.');
    }
    if (!returnedReference)
      throw new BadRequestException('Klump transaction reference is missing.');
    if (String(data.currency ?? '').toUpperCase() !== transaction.payment.currency) {
      throw new BadRequestException('Klump currency does not match checkout.');
    }
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(String(data.amount));
    } catch {
      throw new BadRequestException('Klump amount is invalid.');
    }
    if (!amount.equals(transaction.payment.amount)) {
      throw new BadRequestException('Klump amount does not match checkout.');
    }
    if (typeof data.is_live !== 'boolean' || data.is_live !== transaction.isLive) {
      throw new BadRequestException('Klump environment does not match checkout.');
    }

    const providerStatus = String(data.status ?? '').toLowerCase();
    const status: KlumpTransactionStatus =
      providerStatus === 'successful'
        ? 'SUCCESSFUL'
        : providerStatus === 'abandoned'
          ? 'ABANDONED'
          : providerStatus === 'failed'
            ? 'FAILED'
            : 'INITIATED';

    if (status !== 'SUCCESSFUL') {
      await this.prisma.klumpTransaction.update({
        where: { id: transaction.id },
        data: {
          status,
          providerReference: returnedReference,
          providerPayload: jsonSnapshot(data),
        },
      });
      return {
        transactionId: transaction.id,
        paymentId: transaction.paymentId,
        paymentGroupId: transaction.paymentGroupId,
      };
    }

    await this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM Payment WHERE id = ${transaction.paymentId} FOR UPDATE`,
        );
        const current = await tx.payment.findUniqueOrThrow({
          where: { id: transaction.paymentId },
        });
        if (current.status === 'FAILED') {
          throw new ConflictException(
            'A released Klump checkout later succeeded; staff reconciliation is required.',
          );
        }
        if (current.status !== 'PAID') {
          await tx.payment.update({
            where: { id: current.id },
            data: {
              status: 'PAID',
              providerRef: returnedReference,
              paidAt: new Date(),
              metadata: {
                purpose: 'KLUMP_CHECKOUT',
                merchantReference: transaction.merchantReference,
                providerReference: returnedReference,
              },
            },
          });
          await this.payments.completeGroup(tx, transaction.paymentGroupId);
        }
        await tx.klumpTransaction.update({
          where: { id: transaction.id },
          data: {
            status: 'SUCCESSFUL',
            providerReference: returnedReference,
            providerPayload: jsonSnapshot(data),
            verifiedAt: new Date(),
          },
        });
      },
      { timeout: 15000 },
    );
    await this.payments.dispatchGroupConfirmations([transaction.paymentGroupId]);
    return {
      transactionId: transaction.id,
      paymentId: transaction.paymentId,
      paymentGroupId: transaction.paymentGroupId,
    };
  }

  private async statusById(userId: number, id: number) {
    const transaction = await this.prisma.klumpTransaction.findFirst({
      where: { id, userId },
      include: { payment: true, paymentGroup: true },
    });
    if (!transaction) throw new NotFoundException('Klump checkout was not found.');
    return {
      merchantReference: transaction.merchantReference,
      providerReference: transaction.providerReference,
      status: transaction.status.toLowerCase(),
      paymentStatus: transaction.payment.status.toLowerCase(),
      paymentGroupId: transaction.paymentGroupId,
      amount: transaction.payment.amount,
      currency: transaction.payment.currency,
      environment: transaction.isLive ? 'live' : 'test',
      verifiedAt: transaction.verifiedAt,
      createdAt: transaction.createdAt,
      updatedAt: transaction.updatedAt,
    };
  }

  private presentInitialization(transaction: {
    merchantReference: string;
    checkoutPayload: Prisma.JsonValue;
    status: KlumpTransactionStatus;
    paymentGroupId: number;
    isLive: boolean;
  }) {
    return {
      publicKey: this.config.getOrThrow<string>('KLUMP_PUBLIC_KEY'),
      merchantReference: transaction.merchantReference,
      paymentGroupId: transaction.paymentGroupId,
      status: transaction.status.toLowerCase(),
      environment: transaction.isLive ? 'live' : 'test',
      data: transaction.checkoutPayload,
    };
  }

  private checkoutPayload(group: {
    id: number;
    totalAmount: Prisma.Decimal;
    currency: string;
    user: {
      id: number;
      firstName: string | null;
      lastName: string | null;
      email: string;
      phoneNumber: string | null;
    };
    allocations: Array<{
      order: {
        orderNumber: string;
        total: Prisma.Decimal;
        store: { storeName: string };
        items: Array<{ productImage: string | null }>;
      };
    }>;
  }) {
    const amount = this.integerAmount(group.totalAmount, 'Klump checkout total');
    const items = group.allocations.map(({ order }) => ({
      name: `${order.store.storeName} order ${order.orderNumber}`,
      unit_price: this.integerAmount(order.total, `Order ${order.orderNumber} total`),
      quantity: 1,
      ...(order.items[0]?.productImage ? { image_url: order.items[0].productImage } : {}),
    }));
    if (items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0) !== amount) {
      throw new BadRequestException('Klump item totals do not match checkout total.');
    }
    const redirectUrl = this.config.get<string>('KLUMP_REDIRECT_URL');
    return {
      amount,
      shipping_fee: 0,
      currency: group.currency,
      first_name: group.user.firstName ?? undefined,
      last_name: group.user.lastName ?? undefined,
      email: group.user.email,
      phone: group.user.phoneNumber ?? undefined,
      ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
      meta_data: { paymentGroupId: group.id, userId: group.user.id },
      items,
    };
  }

  private integerAmount(amount: Prisma.Decimal, label: string) {
    if (!amount.equals(amount.toDecimalPlaces(0))) {
      throw new BadRequestException(`${label} must be a whole-number NGN amount.`);
    }
    const value = amount.toNumber();
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new BadRequestException(`${label} is outside Klump's supported amount range.`);
    }
    return value;
  }

  private data(event: Record<string, unknown>) {
    if (!event.data || typeof event.data !== 'object') {
      throw new BadRequestException('Klump webhook data is missing.');
    }
    return event.data as KlumpData;
  }

  private providerReference(data: KlumpData) {
    if (typeof data.reference === 'string') return data.reference;
    if (typeof data.id === 'string') return data.id;
    return undefined;
  }

  private merchantReference(data: KlumpData) {
    if (typeof data.merchant_reference === 'string') return data.merchant_reference;
    const metadata = data.meta_data;
    if (metadata && typeof metadata === 'object') {
      const value = (metadata as Record<string, unknown>).merchant_reference;
      if (typeof value === 'string') return value;
    }
    return undefined;
  }

  private configuration() {
    this.config.getOrThrow<string>('KLUMP_PUBLIC_KEY');
    this.config.getOrThrow<string>('KLUMP_SECRET_KEY');
    this.mode();
  }

  private mode() {
    const mode = (this.config.get<string>('KLUMP_MODE') || 'test').toLowerCase();
    if (!['test', 'live'].includes(mode)) {
      throw new BadRequestException('KLUMP_MODE must be test or live.');
    }
    return mode as 'test' | 'live';
  }

  private isLive() {
    return this.mode() === 'live';
  }
}
