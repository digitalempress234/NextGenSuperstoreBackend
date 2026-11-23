import { ReceiptSettingsService } from '../src/receipts/receipt-settings.service';

describe('ReceiptSettingsService', () => {
  it('enables PDF receipt attachments by default when no setting exists', async () => {
    const prisma = {
      platformConfig: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new ReceiptSettingsService(prisma as never);

    await expect(service.settings()).resolves.toEqual({ attachPdfToEmail: true });
  });

  it('returns a persisted disabled setting', async () => {
    const prisma = {
      platformConfig: {
        findUnique: jest.fn().mockResolvedValue({
          key: 'receipt_email_settings',
          value: JSON.stringify({ attachPdfToEmail: false }),
        }),
      },
    };
    const service = new ReceiptSettingsService(prisma as never);

    await expect(service.settings()).resolves.toEqual({ attachPdfToEmail: false });
  });

  it('audits an administrator setting update', async () => {
    const tx = {
      platformConfig: { upsert: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };
    const service = new ReceiptSettingsService(prisma as never);

    await expect(service.update(7, { attachPdfToEmail: false })).resolves.toEqual({
      attachPdfToEmail: false,
    });
    expect(tx.platformConfig.upsert).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          staffActorId: 7,
          action: 'RECEIPT_EMAIL_SETTINGS_UPDATED',
        }),
      }),
    );
  });
});
