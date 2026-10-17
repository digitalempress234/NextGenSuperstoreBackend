import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiConflictResponse, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { OkExample } from '../common/api-docs';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { DeliveryService } from './delivery.service';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { ListAvailableDeliveriesDto } from './dto/delivery-job.dto';

@ApiTags('Delivery')
@Controller('deliveries')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  @Get('mine')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.view')
  @ApiOperation({
    summary: 'Rider: list assigned deliveries and restore active delivery state',
    description:
      'Use this endpoint when the rider app starts or resumes. An active delivery with status ARRIVED_AT_CUSTOMER should reopen the customer handoff/QR confirmation UI. DELIVERED, FAILED, and CANCELLED are terminal states.',
  })
  @OkExample(
    [
      {
        id: 1,
        orderId: 10,
        status: 'ARRIVED_AT_CUSTOMER',
        arrivedAt: '2026-10-09T09:30:00.000Z',
      },
    ],
    'List of my deliveries',
  )
  mine(@CurrentUser('id') riderId: number) {
    return this.deliveryService.myDeliveries(riderId);
  }

  @Get('overview')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.view')
  @ApiOperation({ summary: 'Get overview statistics for the current rider' })
  @OkExample(
    { totalDeliveries: 45, completedDeliveries: 40, failedDeliveries: 2, pendingDeliveries: 3 },
    'Rider overview statistics',
  )
  overview(@CurrentUser('id') riderId: number) {
    return this.deliveryService.overview(riderId);
  }

  @Get('offers')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.view')
  @ApiOperation({
    summary: 'Rider: list legacy targeted delivery offers',
    description:
      'Returns only DeliveryOffer records explicitly created for the authenticated rider. Open nearby jobs are returned by GET /deliveries/available instead.',
    deprecated: true,
  })
  @OkExample([{ id: 1, orderId: 11, status: 'PENDING' }], 'List of available delivery offers')
  offers(@CurrentUser('id') riderId: number) {
    return this.deliveryService.offers(riderId);
  }

  @Get('available')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.view')
  @ApiOperation({
    summary: 'Approved rider: browse available delivery jobs',
    description:
      'Requires a fresh rider GPS point. Returns unassigned orders that are ready for pickup, within the configured store radius, and inside the registered rider service area. Stores without coordinates use service-area matching and return `SERVICE_AREA_FALLBACK`. Results are paginated with a default limit of 15. Customer contact details and the full delivery address are withheld until the rider claims the job.',
  })
  @OkExample({
    items: [
      {
        id: 33,
        orderId: 501,
        orderNumber: 'PUR-261007-ABCDEFGH',
        status: 'PENDING',
        pickup: { storeId: 8, storeName: 'Ikeja Superstore', city: 'Ikeja', state: 'Lagos' },
        destination: { city: 'Ikeja', state: 'Lagos' },
        deliveryFee: 2500,
        currency: 'NGN',
        itemCount: 3,
        distanceKm: 2.4,
        matchingMode: 'LIVE_GPS',
        createdAt: '2026-10-07T10:00:00.000Z',
      },
    ],
    meta: {
      page: 1,
      limit: 15,
      total: 1,
      totalPages: 1,
      radiusKm: 10,
      riderLocationUpdatedAt: '2026-10-07T11:50:00.000Z',
    },
  })
  available(@CurrentUser('id') riderId: number, @Query() query: ListAvailableDeliveriesDto) {
    return this.deliveryService.available(riderId, query.page, query.limit);
  }

  @Post(':id/claim')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.status.update')
  @ApiOperation({
    summary: 'Approved rider: claim an available delivery job',
    description:
      'Atomically assigns the ready order to the first eligible online rider who claims it. A second rider receives 409 Conflict, and connected rider clients receive `delivery.job.claimed` on the `/delivery` Socket.IO namespace so they can remove the job. The assigned rider must still verify the store handoff QR and product checklist before pickup.',
  })
  @OkExample(
    { id: 33, orderId: 501, riderId: 1001, status: 'ASSIGNED' },
    'Delivery claimed successfully',
  )
  @ApiConflictResponse({
    description: 'Another rider already claimed the delivery, or the order is no longer available.',
    schema: {
      example: {
        success: false,
        error: { code: 'CONFLICT', message: 'Delivery has already been claimed.' },
      },
    },
  })
  claim(@CurrentUser('id') riderId: number, @Param('id', ParseIntPipe) deliveryId: number) {
    return this.deliveryService.claim(riderId, deliveryId);
  }

  @Post('offers/:id/accept')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.status.update')
  @OkExample({ id: 1, orderId: 11, status: 'ACCEPTED' }, 'Offer accepted successfully')
  accept(@CurrentUser('id') riderId: number, @Param('id', ParseIntPipe) offerId: number) {
    return this.deliveryService.accept(riderId, offerId);
  }

  @Patch(':id/status')
  @ApiCookieAuth('purse_access_token')
  @RequirePermissions('deliveries.status.update')
  @ApiOperation({
    summary: 'Assigned rider: update delivery progress',
    description:
      'The assigned rider may report transit, arrival at the customer, failure, or cancellation. ARRIVED_AT_CUSTOMER is persisted for app state restoration. Pickup requires the store handoff QR, and completion requires the customer QR.',
  })
  @OkExample(
    { id: 1, status: 'ARRIVED_AT_CUSTOMER', arrivedAt: '2026-10-09T09:30:00.000Z' },
    'Delivery status updated',
  )
  status(
    @CurrentUser('id') riderId: number,
    @Param('id', ParseIntPipe) deliveryId: number,
    @Body() body: UpdateDeliveryStatusDto,
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
