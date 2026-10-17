import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';

import { verifyKlumpWebhook } from '../src/bnpl/klump-webhook';
import { KlumpService } from '../src/bnpl/klump.service';

describe('Klump webhook authentication', () => {
  const secret = 'klump-test-secret';
  const body = {
    event: 'klump.payment.transaction.successful',
    data: { reference: 'KLP-1', amount: '25000.00' },
  };

  it('accepts the documented HMAC-SHA512 signature', () => {
    const signature = createHmac('sha512', secret).update(JSON.stringify(body)).digest('hex');
    expect(() => verifyKlumpWebhook(signature, body, secret)).not.toThrow();
  });

  it('rejects missing, malformed, and tampered signatures', () => {
    expect(() => verifyKlumpWebhook(undefined, body, secret)).toThrow(UnauthorizedException);
    expect(() => verifyKlumpWebhook('short', body, secret)).toThrow(UnauthorizedException);
    const signature = createHmac('sha512', secret).update(JSON.stringify(body)).digest('hex');
    expect(() =>
      verifyKlumpWebhook(signature, { ...body, data: { reference: 'KLP-2' } }, secret),
    ).toThrow(UnauthorizedException);
  });
});

describe('Klump server-side verification', () => {
  const transaction = {
    id: 8,
    userId: 3,
    paymentId: 5,
    paymentGroupId: 20,
    merchantReference: 'PURSE-KLUMP-20-internal',
    providerReference: null,
    isLive: false,
    payment: {
      id: 5,
      amount: new Prisma.Decimal('25000.00'),
      currency: 'NGN',
      status: 'PENDING',
    },
    paymentGroup: { id: 20 },
  };

  function fixture(amount = '25000.00') {
    const prisma = {
      klumpTransaction: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(transaction)
          .mockResolvedValueOnce({
            ...transaction,
            status: 'SUCCESSFUL',
            providerReference: 'KLP-1644-083962-4231',
            verifiedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
            payment: { ...transaction.payment, status: 'PAID' },
          }),
        update: jest.fn(),
      },
      payment: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(transaction.payment),
        update: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: typeof prisma) => unknown) =>
      callback(prisma),
    );
    const payments = {
      completeGroup: jest.fn(),
      dispatchGroupConfirmations: jest.fn(),
      summary: jest.fn().mockResolvedValue({ paymentGroupId: 20, paymentStatus: 'paid' }),
    };
    const client = {
      verify: jest.fn().mockResolvedValue({
        state: 'success',
        data: {
          reference: 'KLP-1644-083962-4231',
          amount,
          status: 'successful',
          currency: 'NGN',
          is_live: false,
          meta_data: { merchant_reference: transaction.merchantReference },
        },
      }),
    };
    const service = new KlumpService(
      prisma as never,
      {} as never,
      payments as never,
      client as never,
      {} as never,
    );
    return { service, prisma, payments, client };
  }

  it('confirms orders only after all provider values match', async () => {
    const { service, prisma, payments } = fixture();
    const result = await service.verify(3, 'KLP-1644-083962-4231');
    expect(payments.completeGroup).toHaveBeenCalledWith(prisma, 20);
    expect(payments.dispatchGroupConfirmations).toHaveBeenCalledWith([20]);
    expect(result.transaction).toEqual(expect.objectContaining({ status: 'successful' }));
  });

  it('rejects a provider amount that differs from the reserved checkout', async () => {
    const { service, payments } = fixture('24999.00');
    await expect(service.verify(3, 'KLP-1644-083962-4231')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(payments.completeGroup).not.toHaveBeenCalled();
  });
});
