import { UnauthorizedException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';

export function verifyKlumpWebhook(
  signature: string | undefined,
  body: Record<string, unknown>,
  secret: string,
) {
  if (!signature || !/^[a-fA-F0-9]{128}$/.test(signature)) {
    throw new UnauthorizedException('Invalid Klump webhook signature.');
  }
  const expected = createHmac('sha512', secret).update(JSON.stringify(body)).digest();
  const received = Buffer.from(signature, 'hex');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    throw new UnauthorizedException('Invalid Klump webhook signature.');
  }
}
