import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { DeliveryStatus } from '@prisma/client';

import { OkExample } from '../common/api-docs';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { DeliveryService } from './delivery.service';

@ApiTags('Delivery')
@Controller('deliveries')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('mine')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.view')
  @OkExample([{ id: 1, orderId: 10, status: 'IN_TRANSIT' }], 'List of my deliveries')
  mine(@CurrentUser('id') riderId: number) {
    return this.deliveryService.myDeliveries(riderId);
  }

  @Get('overview')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.view')
  @ApiOperation({ summary: 'Get overview statistics for the current rider' })
  @OkExample({ totalDeliveries: 45, completedDeliveries: 40, failedDeliveries: 2, pendingDeliveries: 3 }, 'Rider overview statistics')
  overview(@CurrentUser('id') riderId: number) {
    return this.deliveryService.overview(riderId);
  }

  @Get('offers')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.view')
  @OkExample([{ id: 1, orderId: 11, status: 'PENDING' }], 'List of available delivery offers')
  offers(@CurrentUser('id') riderId: number) {
    return this.deliveryService.offers(riderId);
  }

  @Post('offers/:id/accept')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.status.update')
  @OkExample({ id: 1, orderId: 11, status: 'ACCEPTED' }, 'Offer accepted successfully')
  accept(
    @CurrentUser('id') riderId: number,
    @Param('id', ParseIntPipe) offerId: number,
  ) {
    return this.deliveryService.accept(riderId, offerId);
  }

  @Patch(':id/status')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.status.update')
  @ApiBody({ schema: { type: 'object', properties: { status: { type: 'string', example: 'IN_TRANSIT' }, location: { type: 'string', example: 'Downtown' }, note: { type: 'string', example: 'Heavy traffic' } } } })
  @OkExample({ id: 1, status: 'IN_TRANSIT' }, 'Delivery status updated')
  status(
    @CurrentUser('id') riderId: number,
    @Param('id', ParseIntPipe) deliveryId: number,
    @Body() body: { status: DeliveryStatus; location?: string; note?: string },
  ) {
    return this.deliveryService.updateStatus(
      riderId,
      deliveryId,
      body.status,
      body.location,
      body.note,
    );
  }
}
