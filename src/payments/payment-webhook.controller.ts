import { Body, Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { Public } from '../auth/public.decorator';
import { SkipCsrf } from '../common/skip-csrf.decorator';
import { PaymentsService } from './payments.service';
import { verifyPaystackWebhook } from './paystack-webhook';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Payments')
@Controller('webhooks')
export class PaymentWebhookController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly config: ConfigService,
  ) {}
  @Public()
  @SkipCsrf()
  @Post('payment')
  @ApiOperation({
    summary: 'Receive signed Paystack charge and dedicated-account webhooks',
    description:
      'Verifies checkout/card/transfer payments, credits mapped wallet virtual accounts, and records asynchronous dedicated-account assignment results idempotently.',
  })
  @ApiHeader({
    name: 'x-paystack-signature',
    required: true,
    description: 'HMAC-SHA512 of the raw request body',
  })
  @HttpCode(200)
  webhook(
    @Headers('x-paystack-signature') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
    @Body() body: Record<string, unknown>,
  ) {
    verifyPaystackWebhook(
      signature,
      request.rawBody,
      this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY'),
    );
    return this.payments.handleWebhook(body);
  }
}
