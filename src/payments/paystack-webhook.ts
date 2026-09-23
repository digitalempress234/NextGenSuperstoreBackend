import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyPaystackWebhook(
  signature: string | undefined,
  rawBody: Buffer | undefined,
  secret: string,
): void {
  if (!signature || !rawBody) throw new UnauthorizedException('Invalid webhook request.');
  const expected = Buffer.from(createHmac('sha512', secret).update(rawBody).digest('hex'), 'utf8');
  const received = Buffer.from(signature, 'utf8');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    throw new UnauthorizedException('Invalid webhook signature.');
  }
}
