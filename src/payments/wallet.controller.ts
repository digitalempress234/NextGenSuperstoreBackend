import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsNumber, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, RequireAuth, StandardErrors } from '../common/api-docs';
import { RequirePermissions } from '../common/permissions.decorator';
import { PaymentsService } from './payments.service';
import { money } from '../common/money';

export class TopupWalletDto {
  @ApiProperty({
    minimum: 100,
    maximum: 1000000,
    example: 5000,
    description: 'Amount in NGN to add to the wallet. Minimum ₦100, maximum ₦1,000,000.',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(100)
  @Max(1000000)
  amount!: number;
}

/**
 * Customer Wallet endpoints
 *
 * All routes require the `purse_access_token` HttpOnly cookie.
 * Roles that can use these endpoints: CUSTOMER, VENDOR (any authenticated user).
 */
@ApiTags('Wallet')
@ApiCookieAuth('purse_access_token')
@Controller('wallet')
export class WalletController {
  constructor(private readonly payments: PaymentsService) {}

  // ─── GET /wallet/balance ───────────────────────────────────────────────────
  @Get('balance')
  @ApiOperation({
    summary: 'Get the current wallet balance',
    description:
      'Returns the customer wallet balance in NGN. ' +
      'Returns `{ balance: 0, currency: "NGN" }` if the wallet has not been created yet (no top-ups or credits received). ' +
      '**Required permission**: any authenticated user (`purse_access_token` cookie required).',
  })
  @OkExample({ balance: '2500.00', currency: 'NGN' })
  @StandardErrors()
  async balance(@CurrentUser('id') userId: number) {
    const result = await this.payments.walletTransactions(userId, 1, 1);
    return { balance: result.balance, currency: result.currency };
  }

  // ─── POST /wallet/topup ────────────────────────────────────────────────────
  @Post('topup')
  @RequirePermissions('payments.initiate')
  @RequireAuth(['payments.initiate'], ['CUSTOMER', 'VENDOR'])
  @ApiOperation({
    summary: 'Fund wallet via Paystack card payment',
    description:
      'Initialises a Paystack payment session to credit the customer wallet. ' +
      'Open the returned `paymentUrl` in the mobile WebView or browser. ' +
      'Once the user completes payment, Paystack fires a webhook that automatically credits the wallet — ' +
      'no polling is needed. Call `POST /wallet/topup/:reference/verify` on the callback URL as a fallback. \n\n' +
      '**Required permission**: `payments.initiate` \n' +
      '**Eligible roles**: `CUSTOMER`, `VENDOR` (any authenticated user with this permission)',
  })
  @ApiBody({ type: TopupWalletDto })
  @OkExample({
    id: 55,
    transactionRef: 'TOPUP-1001-550e8400-e29b-41d4-a716-446655440000',
    paymentUrl: 'https://checkout.paystack.com/abc123def456',
    amount: '5000.00',
    currency: 'NGN',
    status: 'PENDING',
  })
  @StandardErrors()
  topup(@CurrentUser('id') userId: number, @Body() dto: TopupWalletDto) {
    return this.payments.topupWallet(userId, money(dto.amount));
  }

  // ─── POST /wallet/topup/:reference/verify ─────────────────────────────────
  @Post('topup/:reference/verify')
  @HttpCode(200)
  @RequirePermissions('payments.initiate')
  @RequireAuth(['payments.initiate'], ['CUSTOMER', 'VENDOR'])
  @ApiOperation({
    summary: 'Verify a wallet top-up payment',
    description:
      'Manually verifies a top-up payment reference against Paystack and credits the wallet if the charge succeeded. ' +
      'Call this after the user is redirected back from the Paystack payment page, ' +
      'or as a fallback if the webhook was missed. \n\n' +
      'Possible `status` values in the response: `PAID` · `FAILED` · `PENDING` (Paystack has not settled yet). \n\n' +
      '**Required permission**: `payments.initiate` \n' +
      '**Eligible roles**: `CUSTOMER`, `VENDOR`',
  })
  @ApiParam({
    name: 'reference',
    example: 'TOPUP-1001-550e8400-e29b-41d4-a716-446655440000',
    description: 'The `transactionRef` returned by POST /wallet/topup.',
  })
  @OkExample({ status: 'PAID', paymentGroupId: null })
  @StandardErrors()
  verifyTopup(
    @CurrentUser('id') _userId: number,
    @Param('reference') reference: string,
  ) {
    if (typeof reference !== 'string' || !reference || reference.length > 191)
      throw new BadRequestException('A valid payment reference is required.');
    return this.payments.verifyReference(reference);
  }

  // ─── GET /wallet/transactions ──────────────────────────────────────────────
  @Get('transactions')
  @RequireAuth([], ['CUSTOMER', 'VENDOR'])
  @ApiOperation({
    summary: 'Paginated wallet transaction history',
    description:
      'Returns all `CREDIT` and `DEBIT` entries for the authenticated user\'s wallet, newest first. ' +
      'Also includes the current balance so the frontend does not need a separate balance call. \n\n' +
      '**Transaction types**: \n' +
      '- `CREDIT` — wallet top-up or admin credit \n' +
      '- `DEBIT` — checkout paid with wallet (`WALLET-{groupId}`) \n\n' +
      '**Required permission**: any authenticated user (`purse_access_token` cookie) \n' +
      '**Eligible roles**: `CUSTOMER`, `VENDOR`',
  })
  @ApiQuery({ name: 'page', required: false, example: 1, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'limit', required: false, example: 20, description: 'Items per page (default: 20, max: 100)' })
  @OkExample({
    balance: '2500.00',
    currency: 'NGN',
    items: [
      {
        id: 1,
        amount: '5000.00',
        type: 'CREDIT',
        description: 'Wallet top-up via Paystack',
        reference: 'TOPUP-CREDIT-55',
        createdAt: '2026-09-23T10:00:00.000Z',
      },
      {
        id: 2,
        amount: '2500.00',
        type: 'DEBIT',
        description: 'Checkout 20',
        reference: 'WALLET-20',
        createdAt: '2026-09-23T12:00:00.000Z',
      },
    ],
    total: 2,
    page: 1,
    limit: 20,
    pages: 1,
  })
  @StandardErrors()
  transactions(
    @CurrentUser('id') userId: number,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const p = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit ?? '20', 10) || 20));
    return this.payments.walletTransactions(userId, p, l);
  }
}
