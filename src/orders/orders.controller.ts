import { Body, Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { UpdateOrderStatusDto } from './dto/order.dto';
import { OrdersService } from './orders.service';
import { OrderStatus } from '@prisma/client';

@ApiTags('Orders')
@ApiCookieAuth('purse_access_token')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @ApiOperation({ summary: 'List orders visible to the authenticated customer' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @OkExample({
    items: [
      {
        id: 501,
        orderNumber: 'PUR-1720000000-A1B2C3D4',
        currentStatus: 'PREPARING',
        total: 10000,
      },
    ],
    page: 1,
    limit: 10,
    total: 1,
  })
  @StandardErrors()
  mine(@CurrentUser('id') userId: number) {
    return this.ordersService.mine(userId);
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
        { fromStatus: 'ORDER_RECEIVED', toStatus: 'CONFIRMED', createdAt: '2026-09-01T10:02:00.000Z' },
      ],
    },
    delivery: {
      id: 33,
      status: 'OUT_FOR_DELIVERY',
      deliveryAddress: '12 Allen Avenue, Ikeja',
      latestLocation: { latitude: 6.5244, longitude: 3.3792, recordedAt: '2026-09-01T11:30:00.000Z' },
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
