import { VersioningType } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';

import { BankResolverService } from '../src/riders/bank-resolver.service';
import { RiderWalletService } from '../src/riders/rider-wallet.service';
import { RidersController } from '../src/riders/riders.controller';
import { RidersService } from '../src/riders/riders.service';
import { RiderSupportController } from '../src/support/rider-support.controller';
import { SupportService } from '../src/support/support.service';

describe('rider payout bank management', () => {
  it('removes an owned primary account and promotes the next verified account', async () => {
    const tx = {
      riderBankAccount: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ id: 10, riderId: 2, isPrimary: true })
          .mockResolvedValueOnce({ id: 11 }),
        delete: jest.fn(),
        update: jest.fn(),
      },
    };
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new RidersService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.removeBankAccount(15, 10)).resolves.toEqual({
      success: true,
      message: 'Bank account removed successfully.',
    });
    expect(tx.riderBankAccount.delete).toHaveBeenCalledWith({ where: { id: 10 } });
    expect(tx.riderBankAccount.update).toHaveBeenCalledWith({
      where: { id: 11 },
      data: { isPrimary: true },
    });
  });

  it('makes only the selected verified account primary', async () => {
    const updated = { id: 11, riderId: 2, verificationStatus: 'APPROVED', isPrimary: true };
    const tx = {
      riderBankAccount: {
        findFirst: jest.fn().mockResolvedValue(updated),
        updateMany: jest.fn(),
        update: jest.fn().mockResolvedValue(updated),
      },
    };
    const prisma = {
      riderProfile: { findUnique: jest.fn().mockResolvedValue({ id: 2 }) },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new RidersService(prisma as never, {} as never, {} as never, {} as never);

    await expect(service.setPrimaryBankAccount(15, 11)).resolves.toEqual(updated);
    expect(tx.riderBankAccount.updateMany).toHaveBeenCalledWith({
      where: { riderId: 2, id: { not: 11 } },
      data: { isPrimary: false },
    });
  });

  it('uses an explicitly selected owned and verified account for withdrawal', async () => {
    const bank = {
      id: 11,
      bankName: 'Access Bank',
      accountNumber: '0123456789',
      accountName: 'Rider One',
      verificationStatus: 'APPROVED',
    };
    const withdrawal = { id: 100, bankName: bank.bankName, accountNumber: bank.accountNumber };
    const tx = {
      wallet: { update: jest.fn() },
      walletTransaction: { create: jest.fn() },
      withdrawal: { create: jest.fn().mockResolvedValue(withdrawal) },
    };
    const prisma = {
      wallet: { findUnique: jest.fn().mockResolvedValue({ id: 4, balance: 10000 }) },
      riderProfile: {
        findUnique: jest.fn().mockResolvedValue({ id: 2, bankAccounts: [bank] }),
      },
      $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new RiderWalletService(prisma as never);

    await expect(
      service.requestWithdrawal(15, { amount: 5000, mode: 'MANUAL', bankAccountId: 11 }),
    ).resolves.toEqual(withdrawal);
    expect(prisma.riderProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 15 },
        include: { bankAccounts: { where: { id: 11 }, take: 1 } },
      }),
    );
    expect(tx.withdrawal.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bankName: bank.bankName,
        accountNumber: bank.accountNumber,
        accountName: bank.accountName,
      }),
    });
  });
});

describe('rider delivery support', () => {
  it('creates a ticket only for a delivery assigned to the rider', async () => {
    const createdAt = new Date('2026-10-13T12:00:00.000Z');
    const prisma = {
      delivery: {
        findFirst: jest.fn().mockResolvedValue({ id: 33, orderId: 36 }),
      },
      supportTicket: {
        create: jest.fn().mockResolvedValue({
          id: 1092,
          ticketNumber: 'SUP-1092-A1B2C3',
          deliveryId: 33,
          status: 'OPEN',
          createdAt,
        }),
      },
    };
    const service = new SupportService(prisma as never);

    await expect(
      service.createRiderTicket(15, {
        deliveryId: 33,
        category: 'CUSTOMER_UNREACHABLE',
        description: 'Customer phone is switched off.',
      }),
    ).resolves.toEqual({
      ticketId: 'SUP-1092-A1B2C3',
      id: 1092,
      deliveryId: 33,
      status: 'OPEN',
      createdAt,
    });
    expect(prisma.delivery.findFirst).toHaveBeenCalledWith({
      where: { id: 33, riderId: 15 },
      select: { id: true, orderId: true },
    });
    expect(prisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 15,
        orderId: 36,
        deliveryId: 33,
        category: 'CUSTOMER_UNREACHABLE',
      }),
    });
  });
});

describe('rider banking and support OpenAPI contract', () => {
  it('documents request bodies for Swagger and Scalar', async () => {
    const fixture = await Test.createTestingModule({
      controllers: [RidersController, RiderSupportController],
      providers: [
        { provide: RidersService, useValue: {} },
        { provide: BankResolverService, useValue: {} },
        { provide: RiderWalletService, useValue: {} },
        { provide: SupportService, useValue: {} },
      ],
    }).compile();
    const app = fixture.createNestApplication();
    app.setGlobalPrefix('purse');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    try {
      const document = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
          .addCookieAuth('purse_access_token', {
            type: 'apiKey',
            in: 'cookie',
            name: 'purse_access_token',
          })
          .build(),
      );
      expect(document.paths['/purse/v1/riders/bank-accounts/{id}']?.delete).toBeDefined();
      expect(document.paths['/purse/v1/riders/bank-accounts/{id}/primary']?.patch).toBeDefined();
      expect(document.paths['/purse/v1/riders/support/tickets']?.post).toBeDefined();
      expect(JSON.stringify(document.components?.schemas?.RiderWithdrawDto)).toContain(
        'bankAccountId',
      );
      expect(JSON.stringify(document.components?.schemas?.CreateRiderSupportTicketDto)).toContain(
        'CUSTOMER_UNREACHABLE',
      );
    } finally {
      await app.close();
    }
  });
});
