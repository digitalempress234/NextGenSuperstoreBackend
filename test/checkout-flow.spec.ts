import { BadRequestException, ConflictException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckoutService, quoteFingerprint } from '../src/checkout/checkout.service';
import type { CheckoutSettingsService } from '../src/checkout/checkout-settings.service';
import { PlaceOrderDto } from '../src/checkout/dto/checkout.dto';
import type { CartService } from '../src/cart/cart.service';
import { PaymentsService } from '../src/payments/payments.service';
import type { PaystackClient } from '../src/payments/paystack.client';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { SettlementsService } from '../src/settlements/settlements.service';
import { BnplService, installmentTerms } from '../src/bnpl/bnpl.service';
import { ApplyBnplDto } from '../src/bnpl/bnpl.dto';
import { kobo } from '../src/common/money';
import { verifyPaystackWebhook } from '../src/payments/paystack-webhook';
import { createHmac } from 'crypto';
import { AddCartItemDto } from '../src/cart/dto/cart.dto';
import { PaymentsController } from '../src/payments/payments.controller';
import { OrdersService } from '../src/orders/orders.service';
import type { NotificationsService } from '../src/notifications/notifications.service';

const decimal = (value: string | number) => new Prisma.Decimal(value);

describe('Checkout completion compatibility', () => {
  it('redirects a verified payment to the order-specific app deep link', async () => {
    const payments = {
      verifyReference: jest.fn().mockResolvedValue({ status: 'PAID', paymentGroupId: 5 }),
      redirectOrderId: jest.fn().mockResolvedValue(101),
    };
    const controller = new PaymentsController(
      payments as unknown as PaymentsService,
      { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    );
    const response = await controller.callback('ref');
    expect(response.url).toBe(
      'superstore://payment-success?status=paid&paymentGroupId=5&orderId=101',
    );
  });

  it('filters the existing order list by Flutter status tab', async () => {
    const prisma = { order: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new OrdersService(
      prisma as unknown as PrismaService,
      {} as NotificationsService,
      {} as CartService,
    );
    await service.mine(7, 1, 20, 'in_progress');
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 7,
          currentStatus: { in: ['PREPARING', 'RIDER_ASSIGNED', 'OUT_FOR_DELIVERY'] },
        },
      }),
    );
  });

  it('checks unresolved provider payments and leaves uncertain ones pending', async () => {
    const prisma = {
      payment: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ transactionRef: 'one' }, { transactionRef: 'two' }]),
      },
    };
    const service = new PaymentsService(
      prisma as unknown as PrismaService,
      {} as PaystackClient,
      {} as SettlementsService,
      {} as CartService,
    );
    const verify = jest.spyOn(service, 'verifyReference');
    verify.mockResolvedValueOnce({ status: 'PENDING', paymentGroupId: 1 });
    verify.mockResolvedValueOnce({ status: 'FAILED', paymentGroupId: 2 });
    expect(await service.reconcilePending()).toEqual({
      checked: 2,
      paid: 0,
      failed: 1,
      pending: 1,
      errors: 0,
    });
    expect(prisma.payment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ provider: 'PAYSTACK', status: 'PENDING' }),
      }),
    );
  });
});

describe('Checkout request authenticity', () => {
  it('requires an offer or product selection when adding to cart', async () => {
    const errors = await validate(plainToInstance(AddCartItemDto, { quantity: 1 }));
    expect(errors.some((error) => error.property === 'storeProductId')).toBe(true);
    expect(
      await validate(plainToInstance(AddCartItemDto, { productId: 12, quantity: 1 })),
    ).toHaveLength(0);
  });
  it('accepts a signed raw webhook and rejects altered bodies or signatures', () => {
    const body = Buffer.from('{"event":"charge.success"}');
    const signature = createHmac('sha512', 'test-secret').update(body).digest('hex');
    expect(() => verifyPaystackWebhook(signature, body, 'test-secret')).not.toThrow();
    expect(() => verifyPaystackWebhook(signature, Buffer.from('{}'), 'test-secret')).toThrow();
    expect(() => verifyPaystackWebhook('short', body, 'test-secret')).toThrow();
  });
});

describe('Checkout flow', () => {
  function fixture() {
    const items = [
      {
        id: 1,
        storeProductId: 10,
        quantity: 2,
        unitPrice: decimal(1),
        storeProduct: {
          id: 10,
          productId: 100,
          storeId: 7,
          isActive: true,
          availability: true,
          stockQuantity: 4,
          price: decimal('10.10'),
          discountPrice: null,
          sku: 'A',
          product: { name: 'A', images: [], status: true },
          store: { isActive: true },
        },
      },
      {
        id: 2,
        storeProductId: 11,
        quantity: 1,
        unitPrice: decimal(1),
        storeProduct: {
          id: 11,
          productId: 101,
          storeId: 8,
          isActive: true,
          availability: true,
          stockQuantity: 4,
          price: decimal(20),
          discountPrice: decimal('15.15'),
          sku: 'B',
          product: { name: 'B', images: [], status: true },
          store: { isActive: true },
        },
      },
    ];
    const db = {
      $queryRaw: jest.fn(),
      cart: { findUnique: jest.fn().mockResolvedValue({ id: 12, currency: 'NGN', items }) },
      user: {
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ email: 'buyer@example.com', firstName: 'Buyer' }),
      },
      address: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ address: 'Street', state: 'Lagos', city: 'Ikeja' }),
      },
      pickupStation: {
        findFirst: jest.fn().mockResolvedValue({ id: 4, name: 'Pickup', isActive: true }),
      },
      checkoutPaymentGroup: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 5, paymentMethod: 'CARD' }),
      },
      storeProduct: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      order: {
        create: jest
          .fn()
          .mockImplementation(
            ({ data }: { data: { subtotal: Prisma.Decimal; total: Prisma.Decimal } }) => ({
              id: 1,
              ...data,
            }),
          ),
      },
      delivery: { create: jest.fn() },
      pickup: { create: jest.fn() },
      wallet: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    const cart = { lock: jest.fn().mockResolvedValue({ id: 12 }), recalculate: jest.fn() };
    const settings = {
      settings: jest.fn().mockResolvedValue({
        deliveryEnabled: true,
        deliveryFeePerStore: 2.25,
        opayEnabled: false,
      }),
    };
    const payments = { completeGroup: jest.fn() };
    const service = new CheckoutService(
      db as unknown as PrismaService,
      cart as unknown as CartService,
      settings as unknown as CheckoutSettingsService,
      payments as unknown as PaymentsService,
    );
    return {
      service,
      db,
      items,
      settings,
      payments,
      tx: db as unknown as Prisma.TransactionClient,
    };
  }

  it('recalculates current discounted prices and charges delivery once per store with exact arithmetic', async () => {
    const { service, tx } = fixture();
    const quote = await service.quoteInTransaction(tx, 1, {
      cartId: 12,
      deliveryMethod: 'home_delivery',
      addressId: 1,
    });
    expect(quote.subtotal.toString()).toBe('35.35');
    expect(quote.shippingFee.toString()).toBe('4.5');
    expect(quote.total.toString()).toBe('39.85');
    expect(quote.orders).toHaveLength(2);
  });
  it('does not charge delivery for station pickup', async () => {
    const { service, tx } = fixture();
    const quote = await service.quoteInTransaction(tx, 1, {
      deliveryMethod: 'store_pickup',
      pickupStationId: 4,
    });
    expect(quote.shippingFee.toString()).toBe('0');
    expect(quote.pickupStation?.id).toBe(4);
  });
  it('does not use another customer’s address', async () => {
    const { service, db, tx } = fixture();
    db.address.findFirst.mockResolvedValue(null);
    await expect(
      service.quoteInTransaction(tx, 1, { deliveryMethod: 'home_delivery', addressId: 99 }),
    ).rejects.toThrow('Address not found.');
    expect(db.address.findFirst).toHaveBeenCalledWith({ where: { id: 99, userId: 1 } });
  });
  it('returns structured unavailable items without creating orders', async () => {
    const { service, items, tx, db } = fixture();
    items[0].storeProduct.stockQuantity = 0;
    await expect(
      service.createInTransaction(tx, 1, { deliveryMethod: 'store_pickup', pickupStationId: 4 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.order.create).not.toHaveBeenCalled();
  });
  it('uses a conditional stock reservation and refuses a lost stock race', async () => {
    const { service, tx, db } = fixture();
    db.storeProduct.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.createInTransaction(tx, 1, { deliveryMethod: 'store_pickup', pickupStationId: 4 }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.order.create).not.toHaveBeenCalled();
    expect(db.storeProduct.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ stockQuantity: { gte: 2 } }),
        data: { stockQuantity: { decrement: 2 } },
      }),
    );
  });
  it('resumes the same pending checkout despite JSON key ordering', async () => {
    const { service, tx, db } = fixture();
    db.checkoutPaymentGroup.findUnique.mockResolvedValue({
      id: 5,
      checkoutSnapshot: { input: { pickupStationId: 4, deliveryMethod: 'store_pickup' } },
    });
    const group = await service.createInTransaction(tx, 1, {
      deliveryMethod: 'store_pickup',
      pickupStationId: 4,
    });
    expect(group.id).toBe(5);
    expect(db.storeProduct.updateMany).not.toHaveBeenCalled();
  });
  it('rejects a changed checkout while a payment is pending', async () => {
    const { service, tx, db } = fixture();
    db.checkoutPaymentGroup.findUnique.mockResolvedValue({
      id: 5,
      checkoutSnapshot: { input: { pickupStationId: 4 } },
    });
    await expect(service.createInTransaction(tx, 1, { pickupStationId: 6 })).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
  it('does not complete checkout when the conditional wallet debit fails', async () => {
    const { service, tx, payments } = fixture();
    await expect(
      service.createInTransaction(tx, 1, {
        deliveryMethod: 'store_pickup',
        pickupStationId: 4,
        paymentMethod: 'wallet',
      }),
    ).rejects.toThrow('Insufficient wallet balance.');
    expect(payments.completeGroup).not.toHaveBeenCalled();
  });
});

describe('Payment verification', () => {
  function fixture() {
    const payment = {
      id: 1,
      status: 'PENDING',
      provider: 'PAYSTACK',
      amount: decimal('39.85'),
      currency: 'NGN',
      transactionRef: 'ref',
      groups: [{ id: 2, userId: 7 }],
    };
    const db = {
      payment: {
        findUnique: jest.fn().mockResolvedValue(payment),
        findUniqueOrThrow: jest.fn().mockResolvedValue(payment),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
    const paystack = {
      verify: jest
        .fn()
        .mockResolvedValue({ status: 'success', reference: 'ref', amount: 3985, currency: 'NGN' }),
    };
    const service = new PaymentsService(
      db as unknown as PrismaService,
      paystack as unknown as PaystackClient,
      {} as SettlementsService,
      { lock: jest.fn() } as unknown as CartService,
    );
    const complete = jest.spyOn(service, 'completeGroup').mockResolvedValue();
    const fail = jest.spyOn(service, 'failGroup').mockResolvedValue();
    return { service, db, paystack, complete, fail, payment };
  }
  it.each([{ amount: 1 }, { currency: 'USD' }, { reference: 'other' }])(
    'rejects mismatched verification %j',
    async (mismatch) => {
      const { service, db, paystack } = fixture();
      paystack.verify.mockResolvedValue({
        status: 'success',
        reference: 'ref',
        amount: 3985,
        currency: 'NGN',
        ...mismatch,
      });
      await expect(service.verifyReference('ref')).rejects.toBeInstanceOf(BadRequestException);
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );
  it.each(['pending', 'ongoing', 'processing', 'abandoned'])(
    'keeps %s payments reserved',
    async (status) => {
      const { service, paystack, complete, fail } = fixture();
      paystack.verify.mockResolvedValue({
        status,
        reference: 'ref',
        amount: 3985,
        currency: 'NGN',
      });
      await service.verifyReference('ref');
      expect(complete).not.toHaveBeenCalled();
      expect(fail).not.toHaveBeenCalled();
    },
  );
  it('confirms verified success', async () => {
    const { service, complete } = fixture();
    await expect(service.verifyReference('ref')).resolves.toEqual({
      status: 'PAID',
      paymentGroupId: 2,
    });
    expect(complete).toHaveBeenCalledTimes(1);
  });
  it('releases stock only on a verified failure', async () => {
    const { service, paystack, fail } = fixture();
    paystack.verify.mockResolvedValue({
      status: 'failed',
      reference: 'ref',
      amount: 3985,
      currency: 'NGN',
    });
    await service.verifyReference('ref');
    expect(fail).toHaveBeenCalledTimes(1);
  });
  it('does not settle an already paid reference again', async () => {
    const { service, payment, complete, paystack } = fixture();
    payment.status = 'PAID';
    await service.verifyReference('ref');
    expect(complete).not.toHaveBeenCalled();
    expect(paystack.verify).not.toHaveBeenCalled();
  });
});

describe('Cart clearing and settlement idempotence', () => {
  it('removes only purchased quantities, preserves new cart lines, and settles once', async () => {
    const group = {
      id: 1,
      userId: 7,
      status: 'PENDING',
      cartSnapshot: [{ cartItemId: 11, quantity: 2 }],
      allocations: [{ order: { id: 9, currentStatus: 'ORDER_RECEIVED' } }],
    };
    const db = {
      checkoutPaymentGroup: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(group),
        update: jest.fn().mockImplementation(() => {
          group.status = 'PAID';
        }),
      },
      order: { update: jest.fn() },
      orderStatusHistory: { create: jest.fn() },
      cart: { findUnique: jest.fn().mockResolvedValue({ id: 8 }) },
      cartItem: {
        findFirst: jest.fn().mockResolvedValue({ id: 11, quantity: 5 }),
        update: jest.fn(),
        delete: jest.fn(),
      },
      notification: { create: jest.fn() },
    };
    const settlements = { settleOrder: jest.fn() };
    const service = new PaymentsService(
      db as unknown as PrismaService,
      {} as PaystackClient,
      settlements as unknown as SettlementsService,
      { recalculate: jest.fn() } as unknown as CartService,
    );
    await service.completeGroup(db as unknown as Prisma.TransactionClient, 1);
    await service.completeGroup(db as unknown as Prisma.TransactionClient, 1);
    expect(db.cartItem.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { quantity: { decrement: 2 } },
    });
    expect(db.cartItem.delete).not.toHaveBeenCalled();
    expect(settlements.settleOrder).toHaveBeenCalledTimes(1);
    expect(db.notification.create).toHaveBeenCalledTimes(1);
  });
});

describe('BNPL terms and validation', () => {
  it('requires cart, delivery method and payment method for placing an order', async () => {
    const errors = await validate(plainToInstance(PlaceOrderDto, {}));
    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining(['cartId', 'deliveryMethod', 'paymentMethod']),
    );
  });
  it('does not interpret multipart false as consent', async () => {
    const dto = plainToInstance(
      ApplyBnplDto,
      { nibssConsent: 'false' },
      { enableImplicitConversion: true },
    );
    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'nibssConsent')).toBe(true);
  });
  it('allocates rounding remainder to the final installment', () => {
    const terms = installmentTerms('100.00', 3, 0);
    expect(terms.monthlyAmount.toString()).toBe('33.33');
    expect(terms.finalInstallment.toString()).toBe('33.34');
    expect(terms.monthlyAmount.mul(2).add(terms.finalInstallment).equals(terms.totalPayable)).toBe(
      true,
    );
  });
  it('hashes serialized monetary quotes consistently across database JSON key ordering', () => {
    expect(quoteFingerprint({ a: decimal('10.10'), b: 2 })).toBe(
      quoteFingerprint({ b: 2, a: '10.1' }),
    );
    expect(kobo('39.85')).toBe(3985);
  });
  it('does not create orders for unapproved applications', async () => {
    const db = {
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
      bnplApplication: { findFirst: jest.fn().mockResolvedValue({ status: 'PENDING_REVIEW' }) },
    };
    db.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(db));
    const checkout = { createInTransaction: jest.fn() };
    const service = new BnplService(
      db as unknown as PrismaService,
      {} as CartService,
      checkout as unknown as CheckoutService,
      {} as PaymentsService,
      {} as ConfigService,
    );
    await expect(service.confirm(1, 3)).rejects.toThrow('BNPL application must be approved');
    expect(checkout.createInTransaction).not.toHaveBeenCalled();
  });
});
