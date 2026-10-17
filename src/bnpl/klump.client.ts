import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KlumpApiResponse {
  state?: string;
  data?: Record<string, unknown>;
  message?: string;
}

@Injectable()
export class KlumpClient {
  constructor(private readonly config: ConfigService) {}

  private baseUrl() {
    return (this.config.get<string>('KLUMP_BASE_URL') || 'https://api.useklump.com').replace(
      /\/$/,
      '',
    );
  }

  private async request(path: string) {
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl()}${path}`, {
        method: 'GET',
        signal: AbortSignal.timeout(15000),
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'klump-secret-key': this.config.getOrThrow<string>('KLUMP_SECRET_KEY'),
        },
      });
    } catch {
      throw new BadGatewayException('Klump could not be reached.');
    }

    let body: KlumpApiResponse;
    try {
      body = (await response.json()) as KlumpApiResponse;
    } catch {
      throw new BadGatewayException('Klump returned an invalid response.');
    }
    if (!response.ok || body.state === 'error') {
      throw new BadGatewayException(body.message || `Klump request failed (${response.status}).`);
    }
    return body;
  }

  verify(reference: string) {
    return this.request(`/v1/transactions/${encodeURIComponent(reference)}/verify`);
  }

  resendWebhook(reference: string) {
    return this.request(`/v1/transactions/${encodeURIComponent(reference)}/resend-webhook`);
  }
}
