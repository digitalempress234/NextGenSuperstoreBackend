import { Controller, Get, Param, ParseIntPipe, Post, Body, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { OkExample } from '../common/api-docs';
import { CurrentUser } from '../common/current-user.decorator';
import { DeliveryTrackingGateway } from './delivery-tracking.gateway';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { DeliveryTrackingHistoryQueryDto, UpdateDeliveryLocationDto } from './dto/tracking.dto';

@ApiTags('Delivery Tracking')
@ApiCookieAuth('purse_access_token')
@Controller('deliveries')
export class DeliveryTrackingController {
  constructor(
    private readonly tracking: DeliveryTrackingService,
    private readonly gateway: DeliveryTrackingGateway,
  ) {}

  @Post(':id/location')
  @ApiOperation({ summary: 'Record the rider current GPS position.' })
  @ApiResponse({ status: 201, description: 'Location accepted.' })
  record(
    @CurrentUser('id') riderId: number,
    @Param('id', ParseIntPipe) deliveryId: number,
    @Body() body: UpdateDeliveryLocationDto,
  ) {
    return this.tracking.recordLocation(riderId, deliveryId, body).then((location) => {
      this.gateway.broadcastLocation({
        deliveryId,
        latitude: Number(location.latitude),
        longitude: Number(location.longitude),
        accuracyM: location.accuracyM == null ? null : Number(location.accuracyM),
        speedKph: location.speedKph == null ? null : Number(location.speedKph),
        headingDeg: location.headingDeg == null ? null : Number(location.headingDeg),
        batteryLevel: location.batteryLevel,
        recordedAt: location.recordedAt.toISOString(),
      });
      return location;
    });
  }

  @Get(':id/location')
  @ApiOperation({ summary: 'Get the latest delivery GPS position.' })
  @OkExample(
    { latitude: 6.5244, longitude: 3.3792, recordedAt: '2026-08-27T08:00:00.000Z' },
    'Latest location or null.',
  )
  current(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) deliveryId: number) {
    return this.tracking.current(userId, deliveryId);
  }

  @Get(':id/locations')
  @ApiOperation({ summary: 'Get delivery location history.' })
  @OkExample(
    [{ latitude: 6.5244, longitude: 3.3792, recordedAt: '2026-08-27T08:00:00.000Z' }],
    'Chronological location history, newest first.',
  )
  history(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) deliveryId: number,
    @Query() query: DeliveryTrackingHistoryQueryDto,
  ) {
    return this.tracking.history(userId, deliveryId, query.limit);
  }
}
