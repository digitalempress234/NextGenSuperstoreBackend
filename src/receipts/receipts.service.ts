import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, ReceiptStatus } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptPdfService } from './receipt-pdf.service';
import { ReceiptSettingsService } from './receipt-settings.service';

interface ReceiptSnapshotItem {
  id: number;
  productId: number;
  storeProductId: number;
  name: string;
  code: string | null;
  image: string | null;
  quantity: number;
  unitPrice: string;
  total: string;
}

interface ReceiptSnapshotOrder {
  id: number;
  orderNumber: string;
  fulfillmentType: string;
  store: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
    address: string;
    city: string;
    state: string;
  };
  items: ReceiptSnapshotItem[];
  subtotal: string;
  shippingFee: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
}

interface ReceiptSnapshot {
  customer: {
    id: number;
    name: string;
    email: string;
    phone: string | null;
  };
  payment: {
    id: number;
    method: string;
    provider: string;
    reference: string;
    paidAt: string;
  };
  orders: ReceiptSnapshotOrder[];
  totals: {
    subtotal: string;
    shippingFee: string;
    discountAmount: string;
    taxAmount: string;
    totalAmount: string;
  };
}

export interface ReceiptView {
  id: number;
  receiptNumber: string;
  status: ReceiptStatus;
  scope: 'CUSTOMER' | 'STORE';
  currency: string;
  customer: ReceiptSnapshot['customer'];
  payment: ReceiptSnapshot['payment'];
  orders: ReceiptSnapshotOrder[];
  totals: ReceiptSnapshot['totals'];
  refunds: Array<{
    id: number;
    orderId: number;
    orderNumber: string;
    amount: string;
    currency: string;
    status: string;
    completedAt: string | null;
  }>;
  issuedAt: string;
  pdfUrl?: string;
}

const receiptInclude = Prisma.validator<Prisma.ReceiptInclude>()({
  payment: {
    select: {
      refunds: {
        select: {
          id: true,
          orderId: true,
          amount: true,
          currency: true,
          status: true,
          completedAt: true,
          order: { select: { orderNumber: true, storeId: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  },
});

type ReceiptRecord = Prisma.ReceiptGetPayload<{ include: typeof receiptInclude }>;

@Injectable()
export class ReceiptsService {
  private readonly frontendUrl?: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: ReceiptPdfService,
    private readonly mail: MailService,
    private readonly settings: ReceiptSettingsService,
    config: ConfigService,
  ) {
    this.frontendUrl = config.get<string>('FRONTEND_URL')?.replace(/\/$/, '');
  }

  async issueForGroup(tx: Prisma.TransactionClient, paymentGroupId: number) {
    const group = await tx.checkoutPaymentGroup.findUniqueOrThrow({
      where: { id: paymentGroupId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phoneNumber: true,
          },
        },
        payment: true,
        allocations: {
          orderBy: { id: 'asc' },
          include: {
            order: {
              include: {
                store: {
                  select: {
                    id: true,
                    storeName: true,
                    email: true,
                    phone: true,
                    address: true,
                    city: true,
                    state: true,
                  },
                },
                items: { orderBy: { id: 'asc' } },
              },
            },
          },
        },
      },
    });
    if (group.status !== 'PAID') {
      throw new ConflictException('A receipt can only be issued for a paid checkout.');
    }
    if (!group.payment || group.payment.status === 'FAILED' || group.payment.status === 'PENDING') {
      throw new ConflictException('The checkout payment is not complete.');
    }

    const orders: ReceiptSnapshotOrder[] = group.allocations.map(({ order }) => ({
      id: order.id,
      orderNumber: order.orderNumber,
      fulfillmentType: order.fulfillmentType,
      store: {
        id: order.store.id,
        name: order.store.storeName,
        email: order.store.email,
        phone: order.store.phone,
        address: order.store.address,
        city: order.store.city,
        state: order.store.state,
      },
      items: order.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        storeProductId: item.storeProductId,
        name: item.productName,
        code: item.productCode,
        image: item.productImage,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        total: item.totalPrice.toFixed(2),
      })),
      subtotal: order.subtotal.toFixed(2),
      shippingFee: order.shippingFee.toFixed(2),
      discountAmount: order.discountAmount.add(order.shippingDiscount).toFixed(2),
      taxAmount: order.taxAmount.toFixed(2),
      total: order.total.toFixed(2),
    }));
    const subtotal = group.allocations.reduce(
      (sum, allocation) => sum.add(allocation.order.subtotal),
      new Prisma.Decimal(0),
    );
    const shippingFee = group.allocations.reduce(
      (sum, allocation) => sum.add(allocation.order.shippingFee),
      new Prisma.Decimal(0),
    );
    const taxAmount = group.allocations.reduce(
      (sum, allocation) => sum.add(allocation.order.taxAmount),
      new Prisma.Decimal(0),
    );
    const paymentReference =
      group.payment.transactionRef ?? group.payment.providerRef ?? `PAYMENT-${group.payment.id}`;
    const paidAt = group.payment.paidAt ?? new Date();
    const snapshot: ReceiptSnapshot = {
      customer: {
        id: group.user.id,
        name:
          [group.user.firstName, group.user.lastName].filter(Boolean).join(' ') || group.user.email,
        email: group.user.email,
        phone: group.user.phoneNumber,
      },
      payment: {
        id: group.payment.id,
        method: group.paymentMethod,
        provider: group.payment.provider,
        reference: paymentReference,
        paidAt: paidAt.toISOString(),
      },
      orders,
      totals: {
        subtotal: subtotal.toFixed(2),
        shippingFee: shippingFee.toFixed(2),
        discountAmount: group.discountAmount.toFixed(2),
        taxAmount: taxAmount.toFixed(2),
        totalAmount: group.totalAmount.toFixed(2),
      },
    };
    const status = this.statusFromPayment(group.payment.status);

    return tx.receipt.upsert({
      where: { paymentGroupId },
      update: {},
      create: {
        receiptNumber: this.createReceiptNumber(),
        userId: group.userId,
        paymentGroupId,
        paymentId: group.payment.id,
        status,
        currency: group.currency,
        subtotal,
        shippingFee,
        taxAmount,
        discountAmount: group.discountAmount,
        totalAmount: group.totalAmount,
        paymentMethod: group.paymentMethod,
        paymentReference,
        snapshot: JSON.parse(JSON.stringify(snapshot)) as Prisma.InputJsonValue,
        paidAt,
      },
    });
  }

  async listForCustomer(userId: number, page: number, limit: number, status?: ReceiptStatus) {
    await this.ensureCustomerReceipts(userId);
    return this.list({ userId, ...(status ? { status } : {}) }, page, limit);
  }

  async getForCustomer(userId: number, receiptNumber: string) {
    const receipt = await this.prisma.receipt.findFirst({
      where: { receiptNumber, userId },
      include: receiptInclude,
    });
    if (!receipt) throw new NotFoundException('Receipt not found.');
    return this.toView(receipt);
  }

  async getForOrder(userId: number, orderId: number) {
    const allocation = await this.prisma.checkoutPaymentAllocation.findFirst({
      where: { orderId, paymentGroup: { userId } },
      select: { paymentGroupId: true, paymentGroup: { select: { status: true } } },
    });
    if (!allocation) throw new NotFoundException('Order receipt not found.');
    if (allocation.paymentGroup.status !== 'PAID') {
      throw new ConflictException('A receipt is not available until payment is confirmed.');
    }
    await this.ensureGroupReceipt(allocation.paymentGroupId);
    const receipt = await this.prisma.receipt.findUniqueOrThrow({
      where: { paymentGroupId: allocation.paymentGroupId },
      include: receiptInclude,
    });
    return this.toView(receipt);
  }

  async customerPdf(userId: number, receiptNumber: string) {
    const receipt = await this.getForCustomer(userId, receiptNumber);
    return this.pdf.render(receipt);
  }

  async listForStore(
    userId: number,
    storeId: number,
    page: number,
    limit: number,
    status?: ReceiptStatus,
  ) {
    await this.assertStoreAccess(userId, storeId);
    await this.ensurePaidReceipts({
      allocations: { some: { order: { storeId } } },
    });
    const where: Prisma.ReceiptWhereInput = {
      ...(status ? { status } : {}),
      paymentGroup: { allocations: { some: { order: { storeId } } } },
    };
    return this.list(where, page, limit, storeId);
  }

  async getForStore(userId: number, storeId: number, receiptNumber: string) {
    await this.assertStoreAccess(userId, storeId);
    const receipt = await this.prisma.receipt.findFirst({
      where: {
        receiptNumber,
        paymentGroup: { allocations: { some: { order: { storeId } } } },
      },
      include: receiptInclude,
    });
    if (!receipt) throw new NotFoundException('Receipt not found.');
    return this.toView(receipt, storeId);
  }

  async listForAdmin(page: number, limit: number, status?: ReceiptStatus, userId?: number) {
    await this.ensurePaidReceipts(userId ? { userId } : {});
    return this.list({ ...(status ? { status } : {}), ...(userId ? { userId } : {}) }, page, limit);
  }

  async getForAdmin(receiptNumber: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { receiptNumber },
      include: receiptInclude,
    });
    if (!receipt) throw new NotFoundException('Receipt not found.');
    return this.toView(receipt);
  }

  async adminPdf(receiptNumber: string) {
    const receipt = await this.getForAdmin(receiptNumber);
    return this.pdf.render(receipt);
  }

  async resend(receiptNumber: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { receiptNumber },
      include: receiptInclude,
    });
    if (!receipt) throw new NotFoundException('Receipt not found.');
    const delivery = await this.sendReceiptEmail(receipt);
    return {
      receiptNumber,
      sentTo: (receipt.snapshot as unknown as ReceiptSnapshot).customer.email,
      pdfAttached: delivery.pdfAttached,
    };
  }

  async sendEmailById(receiptId: number, eventKey?: string) {
    const receipt = await this.prisma.receipt.findUnique({
      where: { id: receiptId },
      include: receiptInclude,
    });
    if (!receipt) throw new NotFoundException('Receipt not found.');
    await this.sendReceiptEmail(receipt, eventKey);
  }

  private async sendReceiptEmail(receipt: ReceiptRecord, eventKey?: string) {
    const view = this.toView(receipt);
    const settings = await this.settings.settings();
    const orderLabel =
      view.orders.length > 1
        ? `${view.orders[0].orderNumber} +${view.orders.length - 1} more`
        : (view.orders[0]?.orderNumber ?? '');
    await this.mail.sendTemplate(
      'paymentReceived',
      view.customer.email,
      {
        firstName: view.customer.name.split(' ')[0],
        orderNumber: orderLabel,
        receiptNumber: view.receiptNumber,
        amount: view.totals.totalAmount,
        reference: view.payment.reference,
        paidAt: view.payment.paidAt,
        paymentMethod: view.payment.method,
        receiptUrl: this.frontendUrl
          ? `${this.frontendUrl}/receipts/${encodeURIComponent(view.receiptNumber)}`
          : undefined,
      },
      view.customer.id,
      eventKey,
      settings.attachPdfToEmail
        ? {
            attachments: [
              {
                filename: `OhoO-Receipt-${view.receiptNumber}.pdf`,
                content: await this.pdf.render(view),
                contentType: 'application/pdf',
              },
            ],
          }
        : undefined,
    );
    return { pdfAttached: settings.attachPdfToEmail };
  }

  private async list(
    where: Prisma.ReceiptWhereInput,
    page: number,
    limit: number,
    storeId?: number,
  ) {
    limit = Math.min(15, Math.max(1, limit));
    page = Math.max(1, page);
    const [records, total] = await Promise.all([
      this.prisma.receipt.findMany({
        where,
        include: receiptInclude,
        orderBy: { issuedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.receipt.count({ where }),
    ]);
    return {
      items: records.map((record) => this.toView(record, storeId)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  private toView(record: ReceiptRecord, storeId?: number): ReceiptView {
    const snapshot = record.snapshot as unknown as ReceiptSnapshot;
    const orders = storeId
      ? snapshot.orders.filter((order) => order.store.id === storeId)
      : snapshot.orders;
    const totals = storeId ? this.orderTotals(orders) : snapshot.totals;
    const refunds = record.payment.refunds
      .filter((refund) => !storeId || refund.order.storeId === storeId)
      .map((refund) => ({
        id: refund.id,
        orderId: refund.orderId,
        orderNumber: refund.order.orderNumber,
        amount: refund.amount.toFixed(2),
        currency: refund.currency,
        status: refund.status,
        completedAt: refund.completedAt?.toISOString() ?? null,
      }));
    return {
      id: record.id,
      receiptNumber: record.receiptNumber,
      status: record.status,
      scope: storeId ? 'STORE' : 'CUSTOMER',
      currency: record.currency,
      customer: snapshot.customer,
      payment: snapshot.payment,
      orders,
      totals,
      refunds,
      issuedAt: record.issuedAt.toISOString(),
      ...(storeId
        ? {}
        : { pdfUrl: `/purse/v1/receipts/${encodeURIComponent(record.receiptNumber)}/pdf` }),
    };
  }

  private orderTotals(orders: ReceiptSnapshotOrder[]): ReceiptSnapshot['totals'] {
    const total = (
      field: keyof Pick<
        ReceiptSnapshotOrder,
        'subtotal' | 'shippingFee' | 'discountAmount' | 'taxAmount' | 'total'
      >,
    ) => orders.reduce((sum, order) => sum.add(order[field]), new Prisma.Decimal(0)).toFixed(2);
    return {
      subtotal: total('subtotal'),
      shippingFee: total('shippingFee'),
      discountAmount: total('discountAmount'),
      taxAmount: total('taxAmount'),
      totalAmount: total('total'),
    };
  }

  private async ensureCustomerReceipts(userId: number) {
    await this.ensurePaidReceipts({ userId });
  }

  private async ensurePaidReceipts(where: Prisma.CheckoutPaymentGroupWhereInput) {
    const groups = await this.prisma.checkoutPaymentGroup.findMany({
      where: {
        ...where,
        status: 'PAID',
        paymentId: { not: null },
        receipt: { is: null },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: 100,
    });
    for (const group of groups) await this.ensureGroupReceipt(group.id);
  }

  private ensureGroupReceipt(paymentGroupId: number) {
    return this.prisma.$transaction((tx) => this.issueForGroup(tx, paymentGroupId));
  }

  private async assertStoreAccess(userId: number, storeId: number) {
    const store = await this.prisma.store.findFirst({
      where: {
        id: storeId,
        OR: [{ ownerUserId: userId }, { members: { some: { userId } } }],
      },
      select: { id: true },
    });
    if (!store) throw new ForbiddenException('You do not have access to this store.');
  }

  private statusFromPayment(status: string): ReceiptStatus {
    if (status === 'REFUNDED') return 'REFUNDED';
    if (status === 'PARTIALLY_REFUNDED') return 'PARTIALLY_REFUNDED';
    return 'ISSUED';
  }

  private createReceiptNumber(now = new Date()) {
    const date = [
      String(now.getUTCFullYear()).slice(-2),
      String(now.getUTCMonth() + 1).padStart(2, '0'),
      String(now.getUTCDate()).padStart(2, '0'),
    ].join('');
    return `OHO-R-${date}-${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
  }
}
