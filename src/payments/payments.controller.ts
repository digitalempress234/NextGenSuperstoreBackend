import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Redirect,
  Req,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { verifyPaystackWebhook } from './paystack-webhook';
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

  @Get('groups/:id')
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({ summary: 'Poll a payment group and all related store orders' })
  status(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.status(userId, id);
  }

  @Post('groups/:id/verify')
  @HttpCode(200)
  @ApiCookieAuth('purse_access_token')
  @ApiOperation({ summary: 'Verify an unresolved Paystack payment against the provider' })
  verify(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.status(userId, id, true);
  }

  @Public()
  @Get('callback')
  @ApiOperation({
    summary: 'Paystack browser return; verifies payment and redirects to the app',
    description:
      'Success redirects to superstore://payment-success with status, paymentGroupId, and the first orderId. Failure uses payment-failed; unresolved payments use payment-pending.',
  })
  @Redirect()
  async callback(@Query('reference') reference: string) {
    if (typeof reference !== 'string' || !reference || reference.length > 191)
      throw new BadRequestException('A valid payment reference is required.');
    const result = await this.paymentsService.verifyReference(reference);
    const outcome =
      result.status === 'PAID' ? 'success' : result.status === 'FAILED' ? 'failed' : 'pending';
    const orderId = await this.paymentsService.redirectOrderId(result.paymentGroupId);
    const url = new URL(
      this.config.get<string>('PAYMENT_APP_RETURN_URL') || `superstore://payment-${outcome}`,
    );
    url.searchParams.set('status', outcome === 'success' ? 'paid' : outcome);
    url.searchParams.set('paymentGroupId', String(result.paymentGroupId));
    if (orderId) url.searchParams.set('orderId', String(orderId));
    return { url: url.toString(), statusCode: 302 };
  }

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
  @HttpCode(200)
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
    verifyPaystackWebhook(
      signature,
      request.rawBody,
      this.config.getOrThrow<string>('PAYSTACK_SECRET_KEY'),
    );

    return this.paymentsService.handleWebhook(body);
  }
}
