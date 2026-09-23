import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { kobo } from '../common/money';

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

@Injectable()
export class PaystackClient {
  constructor(private readonly config: ConfigService) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    };
  }

  async initialize(
    reference: string,
    email: string,
    amount: Prisma.Decimal.Value,
    callbackUrl?: string,
    channels?: string[],
    metadata?: Record<string, unknown>,
  ) {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: this.headers(),
      body: JSON.stringify({
        reference,
        email,
        amount: kobo(amount),
        channels,
        metadata,
        currency: 'NGN',
        callback_url: callbackUrl ?? this.config.get('PAYSTACK_CALLBACK_URL'),
      }),
    });

    const body = (await response.json()) as PaystackResponse<{
      authorization_url: string;
      access_code: string;
      reference: string;
    }>;

    if (!response.ok || !body.status) {
      throw new InternalServerErrorException(body.message || 'Paystack initialization failed.');
    }

    return body.data;
  }

  async verify(reference: string) {
    const response = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(15000) },
    );
    const body = (await response.json()) as PaystackResponse<Record<string, unknown>>;

    if (!response.ok || !body.status) {
      throw new InternalServerErrorException(body.message || 'Paystack verification failed.');
    }

    return body.data;
  }
}
