import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ScanningService } from '../src/scanning/scanning.service';
import { PaymentsService } from '../src/payments/payments.service';
import { AuthService } from '../src/auth/auth.service';

describe('Refresh-token rotation', () => {
  it('rejects a refresh JWT whose identifier no longer matches the session hash', async () => {
    const jwt = { verifyAsync: jest.fn().mockResolvedValue({ sub: 7, sid: 3, jti: 'old-token' }) };
    const prisma = {
      adminSession: {
        findUnique: jest.fn().mockResolvedValue({
          id: 3,
          userId: 7,
          sessionTokenHash: 'rotated-hash',
          revokedAt: null,
          expiresAt: new Date(Date.now() + 60_000),
        }),
      },
    };
    const config = { getOrThrow: jest.fn().mockReturnValue('refresh-secret') };
    const service = new AuthService(
      prisma as never,
      jwt as never,
      config as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(service.refreshToken('stale-refresh-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

describe('Customer QR release rules', () => {
  it('does not expose a delivery QR before OUT_FOR_DELIVERY', async () => {
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          userId: 2,
          currentStatus: 'PICKED_UP',
          delivery: { id: 4 },
          pickup: null,
        }),
      },
    };
    const service = new ScanningService(prisma as never, {} as never, {} as never);
    await expect(service.customerQr(2, 10)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not expose a pickup QR before READY_FOR_PICKUP', async () => {
    const prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 10,
          userId: 2,
          currentStatus: 'PREPARING',
          delivery: null,
          pickup: { id: 4 },
        }),
      },
    };
    const service = new ScanningService(prisma as never, {} as never, {} as never);
    await expect(service.customerQr(2, 10)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('Paystack partial refunds', () => {
  it('submits only the cancelled order allocation and records provider processing state', async () => {
    const refund = {
      id: 8,
      orderId: 11,
      userId: 3,
      paymentId: 5,
      amount: new Prisma.Decimal('1250.00'),
      currency: 'NGN',
      provider: 'PAYSTACK',
      status: 'PENDING',
      idempotencyKey: 'ORDER-REFUND-11',
      providerRefundId: null,
      payment: { transactionRef: 'PUR-1-REF' },
      order: { orderNumber: 'PUR-ORDER-11' },
    };
    const prisma = {
      refund: {
        findUnique: jest.fn().mockResolvedValue(refund),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...refund, status: 'PROCESSING' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ ...refund, status: 'PROCESSING' }),
      },
      user: { findUnique: jest.fn().mockResolvedValue({ id: 3, email: 'user@example.com' }) },
      notificationPreference: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: { create: jest.fn().mockResolvedValue({ id: 1 }) },
    };
    const paystack = {
      createRefund: jest.fn().mockResolvedValue({ id: 901, status: 'processing' }),
    };
    const notifications = { notifyUser: jest.fn() };
    const service = new PaymentsService(
      prisma as never,
      paystack as never,
      {} as never,
      {} as never,
      notifications as never,
    );
    await service.processRefund(8);
    expect(paystack.createRefund).toHaveBeenCalledWith(
      expect.objectContaining({
        transaction: 'PUR-1-REF',
        amount: refund.amount,
        currency: 'NGN',
      }),
    );
    expect(prisma.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 8 },
        data: expect.objectContaining({ providerRefundId: '901', status: 'PROCESSING' }),
      }),
    );
  });

  it('never sends a Klump refund to Paystack and records staff completion', async () => {
    const refund = {
      id: 9,
      orderId: 12,
      userId: 3,
      paymentId: 6,
      amount: new Prisma.Decimal('25000.00'),
      currency: 'NGN',
      provider: 'KLUMP',
      status: 'MANUAL_REVIEW',
      processingAt: null,
      order: { orderNumber: 'PUR-ORDER-12' },
    };
    const prisma = {
      refund: {
        findUnique: jest.fn().mockResolvedValue(refund),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ ...refund, status: 'SUCCEEDED' }),
        update: jest.fn().mockResolvedValue({ ...refund, status: 'SUCCEEDED' }),
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: refund.amount } }),
      },
      payment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 6, amount: refund.amount }),
        update: jest.fn(),
      },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    const paystack = { createRefund: jest.fn() };
    const notifications = { notifyUser: jest.fn() };
    const service = new PaymentsService(
      prisma as never,
      paystack as never,
      {} as never,
      {} as never,
      notifications as never,
    );
    await service.completeManualRefund(9, 'KLP-REFUND-12345', 1);
    expect(paystack.createRefund).not.toHaveBeenCalled();
    expect(prisma.refund.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 9 },
        data: expect.objectContaining({
          status: 'SUCCEEDED',
          providerRefundId: 'KLP-REFUND-12345',
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});

describe('Paid checkout recovery', () => {
  it('re-runs finalization when Paystack is paid but the cart is still attached', async () => {
    const payment = {
      id: 1,
      status: 'PAID',
      provider: 'PAYSTACK',
      groups: [{ id: 2, userId: 7, status: 'PAID', activeCartId: 9 }],
    };
    const prisma = {
      payment: { findUnique: jest.fn().mockResolvedValue(payment) },
      checkoutPaymentAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(prisma),
    );
    const cart = { lock: jest.fn() };
    const notifications = { processOrderConfirmations: jest.fn() };
    const service = new PaymentsService(
      prisma as never,
      {} as never,
      {} as never,
      cart as never,
      notifications as never,
    );
    const complete = jest.spyOn(service, 'completeGroup').mockResolvedValue();
    await service.verifyReference('PUR-RECOVERY');
    expect(cart.lock).toHaveBeenCalledWith(prisma, 7);
    expect(complete).toHaveBeenCalledWith(prisma, 2);
  });
});
