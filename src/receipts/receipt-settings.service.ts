import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';
import { ReceiptEmailSettingsDto } from './dto/receipt-settings.dto';

const CONFIG_KEY = 'receipt_email_settings';
const DEFAULT_SETTINGS: ReceiptEmailSettingsDto = { attachPdfToEmail: true };

@Injectable()
export class ReceiptSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async settings(
    tx: Prisma.TransactionClient | PrismaService = this.prisma,
  ): Promise<ReceiptEmailSettingsDto> {
    const row = await tx.platformConfig.findUnique({ where: { key: CONFIG_KEY } });
    if (!row) return { ...DEFAULT_SETTINGS };

    try {
      const value = JSON.parse(row.value) as Partial<ReceiptEmailSettingsDto>;
      return {
        attachPdfToEmail:
          typeof value.attachPdfToEmail === 'boolean'
            ? value.attachPdfToEmail
            : DEFAULT_SETTINGS.attachPdfToEmail,
      };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  async update(staffActorId: number, settings: ReceiptEmailSettingsDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.platformConfig.upsert({
        where: { key: CONFIG_KEY },
        create: {
          key: CONFIG_KEY,
          value: JSON.stringify(settings),
          description: 'Controls whether receipt emails include a PDF attachment.',
          updatedById: staffActorId,
        },
        update: {
          value: JSON.stringify(settings),
          updatedById: staffActorId,
        },
      });
      await tx.auditLog.create({
        data: {
          staffActorId,
          action: 'RECEIPT_EMAIL_SETTINGS_UPDATED',
          entity: 'PlatformConfig',
          entityId: CONFIG_KEY,
          changes: JSON.parse(JSON.stringify(settings)) as Prisma.InputJsonValue,
        },
      });
      return settings;
    });
  }
}
