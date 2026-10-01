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

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`https://api.paystack.co${path}`, {
      ...options,
      signal: AbortSignal.timeout(15000),
      headers: { ...this.headers(), ...(options.headers ?? {}) },
    });
    const body = (await response.json()) as PaystackResponse<T>;
    if (!response.ok || !body.status) {
      throw new InternalServerErrorException(body.message || 'Paystack request failed.');
    }
    return body.data;
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

  createBankTransferCharge(
    reference: string,
    email: string,
    amount: Prisma.Decimal.Value,
    accountExpiresAt: Date,
    metadata?: Record<string, unknown>,
  ) {
    return this.request<{
      reference: string;
      status: string;
      display_text?: string;
      account_name: string;
      account_number: string;
      bank: { name: string; slug: string; id: number };
      account_expires_at: string;
    }>('/charge', {
      method: 'POST',
      body: JSON.stringify({
        reference,
        email,
        amount: kobo(amount),
        currency: 'NGN',
        bank_transfer: { account_expires_at: accountExpiresAt.toISOString() },
        metadata,
      }),
    });
  }

  createCustomer(input: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    userId: number;
  }) {
    return this.request<{ id: number; customer_code: string }>('/customer', {
      method: 'POST',
      body: JSON.stringify({
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        phone: input.phone,
        metadata: { userId: input.userId },
      }),
    });
  }

  async findCustomer(emailOrCode: string) {
    const response = await fetch(
      `https://api.paystack.co/customer/${encodeURIComponent(emailOrCode)}`,
      { headers: this.headers(), signal: AbortSignal.timeout(15000) },
    );
    if (response.status === 404) return null;
    const body = (await response.json()) as PaystackResponse<{
      id: number;
      customer_code: string;
    }>;
    if (!response.ok || !body.status) {
      throw new InternalServerErrorException(body.message || 'Could not fetch Paystack customer.');
    }
    return body.data;
  }

  async assignDedicatedAccount(input: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    preferredBank?: string;
  }) {
    return (
      (await this.request<Record<string, unknown> | undefined>('/dedicated_account/assign', {
        method: 'POST',
        body: JSON.stringify({
          email: input.email,
          first_name: input.firstName,
          last_name: input.lastName,
          phone: input.phone,
          preferred_bank: input.preferredBank,
          country: 'NG',
        }),
      })) ?? {}
    );
  }

  requeryDedicatedAccount(accountNumber: string, providerSlug: string, date?: string) {
    const params = new URLSearchParams({
      account_number: accountNumber,
      provider_slug: providerSlug,
    });
    if (date) params.set('date', date);
    return this.request<Record<string, unknown>>(`/dedicated_account/requery?${params.toString()}`);
  }

  async verify(reference: string) {
    return this.request<Record<string, unknown>>(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );
  }
}
