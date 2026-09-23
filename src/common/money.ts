import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export function money(value: Prisma.Decimal.Value): Prisma.Decimal {
  const amount = new Prisma.Decimal(value);
  if (!amount.isFinite() || amount.isNegative()) {
    throw new BadRequestException('Amount must be a finite, non-negative number.');
  }
  return amount.toDecimalPlaces(2);
}

export function kobo(value: Prisma.Decimal.Value): number {
  const amount = money(value).mul(100).toNumber();
  if (!Number.isSafeInteger(amount)) throw new BadRequestException('Amount is too large.');
  return amount;
}
