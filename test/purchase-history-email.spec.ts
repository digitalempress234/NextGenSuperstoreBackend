import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { OrdersService } from '../src/orders/orders.service';

describe('customer purchase-history email', () => {
  const order = {
    orderNumber: 'PUR-501',
    placedAt: new Date('2026-11-20T10:00:00.000Z'),
    currency: 'NGN',
    total: new Prisma.Decimal('28500.00'),
    currentStatus: 'COMPLETED',
    store: { storeName: 'Campus Hub' },
    items: [
      {
        productName: 'Rice',
        productCode: 'RICE-01',
        quantity: 2,
        unitPrice: new Prisma.Decimal('12000.00'),
        totalPrice: new Prisma.Decimal('24000.00'),
      },
    ],
    allocations: [{ paymentGroup: { status: 'PAID', paymentMethod: 'CARD' } }],
  };

  function setup() {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          email: 'customer@example.com',
          firstName: 'Ada',
        }),
      },
      order: { findMany: jest.fn().mockResolvedValue([order]) },
    };
    const mail = { sendTemplate: jest.fn().mockResolvedValue(undefined) };
    const pdf = { render: jest.fn().mockResolvedValue(Buffer.from('%PDF-sample')) };
    const service = new OrdersService(
      prisma as never,
      {} as never,
      {} as never,
      undefined,
      undefined,
      mail as never,
      pdf as never,
    );
    return { prisma, mail, pdf, service };
  }

  it('emails the registered address with the complete item-level CSV', async () => {
    const { prisma, mail, service } = setup();

    const result = await service.emailPurchaseHistory(7, {
      from: '2026-01-01',
      to: '2026-11-21',
    });

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 7,
          placedAt: {
            gte: new Date('2025-12-31T23:00:00.000Z'),
            lte: new Date('2026-11-21T22:59:59.999Z'),
          },
          allocations: {
            some: {
              paymentGroup: {
                status: { in: ['PAID', 'PARTIALLY_REFUNDED', 'REFUNDED'] },
              },
            },
          },
        }),
      }),
    );
    expect(mail.sendTemplate).toHaveBeenCalledWith(
      'purchaseHistory',
      'customer@example.com',
      expect.objectContaining({ orderCount: 1, itemCount: 1, totalValue: '28500.00' }),
      7,
      undefined,
      expect.objectContaining({
        attachments: [expect.objectContaining({ contentType: 'text/csv; charset=utf-8' })],
      }),
    );
    const attachment = mail.sendTemplate.mock.calls[0][5].attachments[0];
    const csv = attachment.content.toString('utf8');
    expect(csv).toContain('PUR-501');
    expect(csv).toContain('Rice');
    expect(csv).toContain('PAID');
    expect(result).toEqual(
      expect.objectContaining({
        status: 'sent',
        email: 'c******r@example.com',
        orderCount: 1,
        format: 'csv',
      }),
    );
  });

  it('can attach both the branded PDF and the complete CSV', async () => {
    const { mail, pdf, service } = setup();

    const result = await service.emailPurchaseHistory(7, { format: 'both' });

    expect(pdf.render).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: 'customer@example.com',
        orderCount: 1,
        items: [expect.objectContaining({ productName: 'Rice', paymentStatus: 'PAID' })],
      }),
    );
    const attachments = mail.sendTemplate.mock.calls[0][5].attachments;
    expect(attachments).toEqual([
      expect.objectContaining({ contentType: 'text/csv; charset=utf-8' }),
      expect.objectContaining({
        contentType: 'application/pdf',
        content: Buffer.from('%PDF-sample'),
      }),
    ]);
    expect(result).toEqual(expect.objectContaining({ format: 'both' }));
  });

  it('rejects an inverted statement date range', async () => {
    const { service } = setup();

    await expect(
      service.emailPurchaseHistory(7, { from: '2026-11-21', to: '2026-01-01' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
