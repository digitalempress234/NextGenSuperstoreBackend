import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CheckoutService } from '../checkout/checkout.service';
import { PlaceOrderDto } from '../checkout/dto/checkout.dto';
import { ListOrdersDto } from './dto/list-orders.dto';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { CreatedExample, OkExample, StandardErrors } from '../common/api-docs';
import { UpdateOrderStatusDto } from './dto/order.dto';
import { OrdersService } from './orders.service';
import { OrderStatus } from '@prisma/client';

@ApiTags('Orders')
@ApiCookieAuth('purse_access_token')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly checkout: CheckoutService,
  ) {}

  @Post()
  @RequirePermissions('checkout.create', 'payments.initiate')
  @ApiOperation({
    summary: 'Place store orders and begin card, OPay, or wallet payment',
    description:
      'A cart spanning multiple stores produces multiple orders in one payment group. For card or OPay, open paymentUrl and verify the payment group before showing completion. Wallet payment completes immediately.',
  })
  @CreatedExample({
    paymentGroupId: 20,
    orderId: 101,
    orders: [{ id: 101, orderNumber: 'PUR-...', total: '121500.00' }],
    paymentStatus: 'processing',
    paymentMethod: 'card',
    paymentReference: 'PUR-20-...',
    paymentUrl: 'https://checkout.paystack.com/example',
    subtotal: '120000.00',
    shippingFee: '1500.00',
    tax: '0.00',
    total: '121500.00',
    currency: 'NGN',
  })
  place(@CurrentUser('id') userId: number, @Body() dto: PlaceOrderDto) {
    return this.checkout.place(userId, dto);
  }

  @Post(':id/reorder')
  @RequirePermissions('cart.manage')
  @ApiOperation({ summary: 'Re-add available items from a fulfilled order to the active cart' })
  async reorder(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.ordersService.reorder(userId, id);
    response.status(result.skippedItems.length ? 207 : 200);
    return result;
  }

  @Get()
  @ApiOperation({
    summary: 'List customer orders with optional screen status filter',
    description:
      'Returns an array. Status may be all, pending, in_progress, ready_for_pickup, delivered, or cancelled.',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['all', 'pending', 'in_progress', 'ready_for_pickup', 'delivered', 'cancelled'],
  })
  @OkExample([
    {
      id: 501,
      orderId: 501,
      orderNumber: 'PUR-1720000000-A1B2C3D4',
      currentStatus: 'PREPARING',
      status: 'in_progress',
      paymentStatus: 'paid',
      paymentMethod: 'card',
      total: '10000.00',
      items: [],
    },
  ])
  @StandardErrors()
  mine(@CurrentUser('id') userId: number, @Query() query: ListOrdersDto) {
    return this.ordersService.mine(userId, query.page, query.limit, query.status);
  }

  @Get(':id/track')
  @ApiOperation({
    summary: 'Get full tracking snapshot for a customer order',
    description:
      'Returns the order status timeline, delivery GPS location, pickup info, and ' +
      'WebSocket connection hints for real-time tracking. Works for both DELIVERY and PICKUP fulfillment types.',
  })
  @ApiParam({ name: 'id', example: 501 })
  @OkExample({
    order: {
      id: 501,
      orderNumber: 'PUR-1720000000-A1B2C3D4',
      fulfillmentType: 'DELIVERY',
      currentStatus: 'OUT_FOR_DELIVERY',
      placedAt: '2026-09-01T10:00:00.000Z',
      store: { id: 1, storeName: 'Lagos Mart', city: 'Lagos', state: 'Lagos' },
      statusHistory: [
        { fromStatus: null, toStatus: 'ORDER_RECEIVED', createdAt: '2026-09-01T10:00:00.000Z' },
        {
          fromStatus: 'ORDER_RECEIVED',
          toStatus: 'CONFIRMED',
          createdAt: '2026-09-01T10:02:00.000Z',
        },
      ],
    },
    delivery: {
      id: 33,
      status: 'OUT_FOR_DELIVERY',
      deliveryAddress: '12 Allen Avenue, Ikeja',
      latestLocation: {
        latitude: 6.5244,
        longitude: 3.3792,
        recordedAt: '2026-09-01T11:30:00.000Z',
      },
      statusUpdates: [
        { status: 'ASSIGNED', createdAt: '2026-09-01T10:30:00.000Z' },
        { status: 'OUT_FOR_DELIVERY', createdAt: '2026-09-01T11:00:00.000Z' },
      ],
    },
    pickup: null,
    websocket: {
      namespace: '/delivery',
      joinEvent: 'delivery:join',
      payload: { deliveryId: 33 },
      locationEvent: 'delivery.location.updated',
      statusEvent: 'delivery.status.updated',
    },
  })
  @StandardErrors()
  track(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.track(userId, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single customer order with fulfillment timeline' })
  @ApiParam({ name: 'id', example: 501 })
  @OkExample({
    id: 501,
    orderNumber: 'PUR-1720000000-A1B2C3D4',
    fulfillmentType: 'DELIVERY',
    currentStatus: 'OUT_FOR_DELIVERY',
    items: [],
    delivery: {
      id: 33,
      status: 'OUT_FOR_DELIVERY',
      deliveryAddress: '12 Allen Avenue, Ikeja',
    },
  })
  @StandardErrors()
  one(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.ordersService.one(userId, id);
  }

  @Patch(':id/status')
  @RequirePermissions('orders.status.update')
  @ApiOperation({ summary: 'Update an operational order status under the order state machine' })
  @ApiParam({ name: 'id', example: 501 })
  @OkExample({ id: 501, currentStatus: 'CONFIRMED' })
  @StandardErrors()
  status(
    @CurrentUser('id') actorId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateOrderStatusDto,
  ) {
    return this.ordersService.setStatus(actorId, id, dto.status as OrderStatus, dto.reason);
  }
}
