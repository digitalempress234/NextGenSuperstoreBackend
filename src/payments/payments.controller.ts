import { Body, Controller, Headers, Post, Req, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBody,
  ApiCookieAuth,
  ApiHeader,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { Public } from '../auth/public.decorator';
import { SkipCsrf } from '../common/skip-csrf.decorator';
import { InitializePaymentDto } from './dto/payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly config: ConfigService,
  ) {}

  @Post('initialize')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('payments.initiate')
  @ApiOperation({ summary: 'Initialize Paystack payment for a checkout payment group' })
  @OkExample({
    payment: {
      reference: 'PUR-CHG-123456789',
      authorizationUrl: 'https://checkout.paystack.com/abc123',
      amount: 1550000,
      currency: 'NGN',
      status: 'PENDING',
    },
  })
  @StandardErrors()
  initialize(@CurrentUser('id') userId: number, @Body() dto: InitializePaymentDto) {
    return this.paymentsService.initialize(userId, dto.paymentGroupId);
  }

  @Public()
  @SkipCsrf()
  @Post('paystack/webhook')
  @ApiOperation({
    summary: 'Paystack webhook endpoint; authenticates the x-paystack-signature header',
  })
  @ApiHeader({ name: 'x-paystack-signature', required: true, example: '0f5b...' })
  @ApiBody({
    schema: {
      example: {
        event: 'charge.success',
        data: {
          reference: 'PUR-CHG-123456789',
          amount: 1550000,
          currency: 'NGN',
          status: 'success',
          customer: { email: 'customer@example.com' },
        },
      },
    },
  })
  @OkExample({ received: true })
  async webhook(
    @Headers('x-paystack-signature') signature: string | undefined,
    @Req() request: Request & { rawBody?: Buffer },
    @Body() body: Record<string, unknown>,
  ) {
    if (!signature || !request.rawBody) {
      throw new UnauthorizedException('Invalid webhook request.');
    }

    const expected = createHmac('sha512', this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY'))
      .update(request.rawBody)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const receivedBuffer = Buffer.from(signature, 'utf8');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      throw new UnauthorizedException('Invalid webhook signature.');
    }

    return this.paymentsService.handleWebhook(body);
  }
}
