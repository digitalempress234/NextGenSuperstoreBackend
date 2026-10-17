import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBody, ApiCookieAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';

import { AdminRoute } from '../auth/admin-route.decorator';
import { Public } from '../auth/public.decorator';
import { CreatedExample, OkExample, StandardErrors } from '../common/api-docs';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { SkipCsrf } from '../common/skip-csrf.decorator';
import { AuthenticatedStaff, StaffJwtGuard } from '../staff/staff-jwt.guard';
import { assertCheckoutStaff } from '../checkout/checkout-settings.controller';
import { InitializeKlumpCheckoutDto, VerifyKlumpTransactionDto } from './dto/klump.dto';
import { verifyKlumpWebhook } from './klump-webhook';
import { KlumpService } from './klump.service';

@ApiTags('Klump BNPL')
@ApiCookieAuth('purse_access_token')
@Controller('bnpl/klump')
export class KlumpController {
  constructor(private readonly klump: KlumpService) {}

  @Post('initialize')
  @RequirePermissions('checkout.create')
  @ApiOperation({
    summary: 'Reserve the cart and create a Klump BNPL checkout',
    description:
      'Returns the Klump public key and server-calculated widget data. Open the Klump checkout on the client, then send the successful Klump transaction reference to the verify endpoint. The cart is cleared only after server-side verification succeeds.',
  })
  @CreatedExample({
    publicKey: 'klp_pk_test_1234',
    merchantReference: 'PURSE-KLUMP-20-550e8400-e29b-41d4-a716-446655440000',
    paymentGroupId: 20,
    status: 'pending',
    environment: 'test',
    data: {
      amount: 121500,
      shipping_fee: 0,
      currency: 'NGN',
      merchant_reference: 'PURSE-KLUMP-20-550e8400-e29b-41d4-a716-446655440000',
      email: 'customer@example.com',
      items: [{ name: 'Demo Store order PUR-261007-ABC123', unit_price: 121500, quantity: 1 }],
    },
  })
  @StandardErrors()
  initialize(@CurrentUser('id') userId: number, @Body() dto: InitializeKlumpCheckoutDto) {
    return this.klump.initialize(userId, dto);
  }

  @Post('verify')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Verify a Klump transaction and confirm the checkout',
    description:
      'The backend fetches the transaction directly from Klump and validates status, amount, currency, environment, and merchant reference before confirming orders.',
  })
  @OkExample({
    transaction: {
      merchantReference: 'PURSE-KLUMP-20-550e8400-e29b-41d4-a716-446655440000',
      providerReference: 'KLP-1644-083962-4231',
      status: 'successful',
      paymentStatus: 'paid',
      paymentGroupId: 20,
      amount: '121500.00',
      currency: 'NGN',
      environment: 'test',
    },
    checkout: { paymentGroupId: 20, paymentStatus: 'paid', orders: [] },
  })
  @StandardErrors()
  verify(@CurrentUser('id') userId: number, @Body() dto: VerifyKlumpTransactionDto) {
    return this.klump.verify(userId, dto.reference);
  }

  @Get('transactions/:merchantReference')
  @ApiOperation({ summary: 'Get the current state of a Klump checkout' })
  @OkExample({
    merchantReference: 'PURSE-KLUMP-20-550e8400-e29b-41d4-a716-446655440000',
    providerReference: 'KLP-1644-083962-4231',
    status: 'successful',
    paymentStatus: 'paid',
    paymentGroupId: 20,
    amount: '121500.00',
    currency: 'NGN',
    environment: 'test',
  })
  @StandardErrors()
  status(@CurrentUser('id') userId: number, @Param('merchantReference') merchantReference: string) {
    return this.klump.status(userId, merchantReference);
  }
}

@ApiTags('Klump BNPL')
@Controller('webhooks/klump')
export class KlumpWebhookController {
  constructor(
    private readonly klump: KlumpService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @SkipCsrf()
  @Post()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Klump webhook endpoint',
    description:
      'Configure this URL in the Klump merchant dashboard. Requests are authenticated with an HMAC-SHA512 X-Klump-Signature and deduplicated using X-Klump-Webhook-Id.',
  })
  @ApiHeader({ name: 'X-Klump-Signature', required: true, example: 'a'.repeat(128) })
  @ApiHeader({ name: 'X-Klump-Webhook-Id', required: true, example: 'wh_01JABC123' })
  @ApiHeader({ name: 'X-Klump-Webhook-Attempt', required: false, example: '1' })
  @ApiBody({
    schema: {
      example: {
        event: 'klump.payment.transaction.successful',
        data: {
          reference: 'KLP-1644-083962-4231',
          merchant_reference: 'PURSE-KLUMP-20-550e8400-e29b-41d4-a716-446655440000',
          amount: '121500.00',
          status: 'successful',
          currency: 'NGN',
          is_live: false,
        },
      },
    },
  })
  @OkExample({ received: true })
  webhook(
    @Headers('x-klump-signature') signature: string | undefined,
    @Headers('x-klump-webhook-id') webhookId: string | undefined,
    @Headers('x-klump-webhook-attempt') attempt: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    verifyKlumpWebhook(signature, body, this.config.getOrThrow<string>('KLUMP_SECRET_KEY'));
    if (!webhookId || webhookId.length > 191) {
      throw new BadRequestException('A valid X-Klump-Webhook-Id header is required.');
    }
    return this.klump.handleWebhook(webhookId, attempt, body);
  }
}

@ApiTags('BNPL administration')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard)
@Controller('admin/bnpl/klump')
export class KlumpAdminController {
  constructor(private readonly klump: KlumpService) {}

  @Post('transactions/:reference/resend-webhook')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Ask Klump to resend the latest webhook for a transaction',
    description: 'Restricted to superadmin, finance, or credit/BNPL staff.',
  })
  @OkExample({ state: 'success', data: { reference: 'KLP-1644-083962-4231' } })
  resend(@Req() req: { staffUser: AuthenticatedStaff }, @Param('reference') reference: string) {
    assertCheckoutStaff(req.staffUser, ['CREDIT_BNPL_ADMIN', 'FINANCE_ADMIN']);
    return this.klump.resendWebhook(req.staffUser.id, reference);
  }
}
