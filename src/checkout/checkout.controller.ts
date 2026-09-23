import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post } from '@nestjs/common';
import { PaymentsService } from '../payments/payments.service';
import { CheckoutSettingsService } from './checkout-settings.service';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { CreateCheckoutDto } from './dto/checkout.dto';
import { CheckoutService } from './checkout.service';

@ApiTags('Checkout')
@ApiCookieAuth('purse_access_token')
@Controller('checkout')
export class CheckoutController {
  constructor(
    private readonly checkoutService: CheckoutService,
    private readonly payments: PaymentsService,
    private readonly settings: CheckoutSettingsService,
  ) {}

  @Get('options')
  @ApiOperation({ summary: 'Get enabled checkout channels and delivery settings' })
  @OkExample({
    deliveryFeePerStore: 1500,
    deliveryEnabled: true,
    opayEnabled: false,
    paymentMethods: ['card', 'wallet'],
    currency: 'NGN',
  })
  async options() {
    const settings = await this.settings.settings();
    return {
      ...settings,
      paymentMethods: ['card', 'wallet', ...(settings.opayEnabled ? ['opay'] : [])],
      currency: 'NGN',
    };
  }

  @Post('review')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Review current cart prices, availability, shipping, and store order totals',
    description:
      'All monetary totals are calculated by the server. Pickup requires a station; home delivery requires an owned address.',
  })
  @OkExample({
    cartId: 12,
    currency: 'NGN',
    fulfillmentType: 'DELIVERY',
    subtotal: '120000.00',
    shippingFee: '1500.00',
    tax: '0.00',
    total: '121500.00',
    orders: [{ storeId: 7, subtotal: '120000.00', shippingFee: '1500.00', total: '121500.00' }],
  })
  @RequirePermissions('checkout.create')
  review(@CurrentUser('id') userId: number, @Body() dto: CreateCheckoutDto) {
    return this.checkoutService.quote(userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get all store orders and payment status for a checkout group' })
  @OkExample({
    paymentGroupId: 20,
    paymentStatus: 'paid',
    orders: [{ id: 101, orderNumber: 'PUR-...' }],
    total: '121500.00',
    currency: 'NGN',
  })
  summary(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.payments.summary(userId, id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancel an uninitialized unpaid checkout and release stock' })
  cancel(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.payments.cancel(userId, id);
  }

  @Post()
  @RequirePermissions('checkout.create')
  @ApiOperation({
    summary: 'Create store-specific orders from the current cart and a single payment group',
  })
  @OkExample({
    paymentGroup: {
      id: 1001,
      totalAmount: 15500,
      currency: 'NGN',
      status: 'PENDING',
    },
    orders: [
      {
        id: 501,
        orderNumber: 'PUR-1720000000-A1B2C3D4',
        storeId: 10,
        fulfillmentType: 'DELIVERY',
        currentStatus: 'ORDER_RECEIVED',
        total: 10000,
      },
      {
        id: 502,
        orderNumber: 'PUR-1720000000-E5F6G7H8',
        storeId: 12,
        fulfillmentType: 'DELIVERY',
        currentStatus: 'ORDER_RECEIVED',
        total: 5500,
      },
    ],
  })
  @StandardErrors()
  create(@CurrentUser('id') userId: number, @Body() dto: CreateCheckoutDto) {
    return this.checkoutService.create(userId, dto);
  }
}
