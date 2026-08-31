import { Body, Controller, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { CreateCheckoutDto } from './dto/checkout.dto';
import { CheckoutService } from './checkout.service';

@ApiTags('Checkout')
@ApiCookieAuth('purse_access_token')
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
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
  create(
    @CurrentUser('id') userId: number,
    @Body() dto: CreateCheckoutDto,
  ) {
    return this.checkoutService.create(userId, dto);
  }
}
