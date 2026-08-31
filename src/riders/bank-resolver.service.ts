import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

@Injectable()
export class BankResolverService {
  constructor(private readonly config: ConfigService) {}

  async listBanks() {
    const response = await fetch('https://api.paystack.co/bank?country=nigeria&perPage=100', {
      headers: this.headers(),
    });
    const body = (await response.json()) as PaystackResponse<
      Array<{ name: string; code: string; active: boolean; slug: string }>
    >;

    if (!response.ok || !body.status) {
      throw new BadRequestException(body.message || 'Unable to load supported banks.');
    }

    return body.data.filter((bank) => bank.active);
  }

  async resolveAccount(bankCode: string, accountNumber: string) {
    const response = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
      { headers: this.headers() },
    );
    const body = (await response.json()) as PaystackResponse<{
      account_number: string;
      account_name: string;
      bank_id?: number;
    }>;

    if (!response.ok || !body.status) {
      throw new BadRequestException(body.message || 'Bank account could not be verified.');
    }

    const banks = await this.listBanks();
    const bank = banks.find((item) => item.code === bankCode);

    return {
      bankCode,
      bankName: bank?.name ?? 'Unknown bank',
      ...body.data,
    };
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY')}`,
      'Content-Type': 'application/json',
    };
  }
}
