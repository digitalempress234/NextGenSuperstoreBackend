import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample } from '../common/api-docs';
import { ScanItemDto, ScanOrderQrDto } from './dto/scanning.dto';
import { ScanningService } from './scanning.service';

@ApiTags('Order QR')
@ApiCookieAuth('purse_access_token')
@Controller('orders')
export class OrderQrController {
  constructor(private readonly scanning: ScanningService) {}
  @Get(':id/qr')
  @RequirePermissions('orders.qr.view')
  @ApiOperation({ summary: 'Customer: generate a secure QR for delivery or store collection' })
  @OkExample({
    orderId: 101,
    purpose: 'CUSTOMER_DELIVERY',
    qrPayload: 'purse://order-handoff?token=...',
    qrImage: 'data:image/png;base64,...',
    expiresAt: '2026-09-29T22:30:00.000Z',
    status: 'active',
  })
  qr(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.scanning.customerQr(userId, id);
  }
  @Post(':id/qr/regenerate')
  @RequirePermissions('orders.qr.view')
  @ApiOperation({ summary: 'Customer: revoke and regenerate an order QR' })
  regenerate(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.scanning.customerQr(userId, id, true);
  }
}

@ApiTags('Rider scanning')
@ApiCookieAuth('purse_access_token')
@RequirePermissions('deliveries.scan')
@Controller('riders/orders')
export class RiderScanController {
  constructor(private readonly scanning: ScanningService) {}
  @Post('scan')
  @ApiOperation({ summary: 'Rider: verify an assigned order handoff QR' })
  @OkExample({
    verified: true,
    orderId: 101,
    orderNumber: 'PUR-...',
    purpose: 'RIDER_PICKUP',
    checklist: [],
  })
  scan(@CurrentUser('id') riderId: number, @Body() dto: ScanOrderQrDto) {
    return this.scanning.scanOrder(riderId, dto.payload);
  }
  @Get(':id/scan-checklist')
  @ApiOperation({ summary: 'Rider: get the expected product pickup checklist' })
  checklist(@CurrentUser('id') riderId: number, @Param('id', ParseIntPipe) id: number) {
    return this.scanning.checklist(riderId, id, 'RIDER_PICKUP');
  }
  @Post(':id/items/scan')
  @ApiOperation({ summary: 'Rider: scan an expected product or SKU during pickup' })
  item(
    @CurrentUser('id') riderId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScanItemDto,
  ) {
    return this.scanning.scanItem(riderId, id, 'RIDER_PICKUP', dto.code, dto.quantity ?? 1);
  }
  @Post(':id/confirm-pickup')
  @ApiOperation({ summary: 'Rider: consume handoff QR after every item is verified' })
  pickup(
    @CurrentUser('id') riderId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScanOrderQrDto,
  ) {
    return this.scanning.confirmPickup(riderId, id, dto.payload);
  }
  @Post(':id/confirm-delivery')
  @ApiOperation({ summary: 'Rider: verify customer QR and complete delivery' })
  delivery(
    @CurrentUser('id') riderId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ScanOrderQrDto,
  ) {
    return this.scanning.confirmDelivery(riderId, id, dto.payload);
  }
}

@ApiTags('Store packing & handoff scanning')
@ApiCookieAuth('purse_access_token')
@RequirePermissions('inventory.scan')
@Controller('stores/:storeId/orders')
export class StoreScanController {
  constructor(private readonly scanning: ScanningService) {}
  @Get(':orderId/scan-checklist')
  @ApiOperation({ summary: 'Vendor/store agent: get packing scan checklist' })
  @OkExample([
    {
      orderItemId: 1,
      productId: 10,
      productName: 'Product',
      barcode: '0123456789012',
      expectedQuantity: 2,
      scannedQuantity: 1,
      complete: false,
    },
  ])
  checklist(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.scanning.checklist(userId, orderId, 'PACKING', storeId);
  }
  @Post(':orderId/items/scan')
  @ApiOperation({ summary: 'Vendor/store agent: scan a product while packing' })
  item(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Body() dto: ScanItemDto,
  ) {
    return this.scanning.scanItem(userId, orderId, 'PACKING', dto.code, dto.quantity ?? 1, storeId);
  }
  @Post(':orderId/items/complete')
  @ApiOperation({ summary: 'Vendor/store agent: complete packing after all scans pass' })
  complete(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.scanning.completePacking(userId, storeId, orderId);
  }
  @Post(':orderId/handoff-qr')
  @ApiOperation({ summary: 'Vendor/store agent: create a one-time assigned-rider handoff QR' })
  qr(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('orderId', ParseIntPipe) orderId: number,
  ) {
    return this.scanning.handoffQr(userId, storeId, orderId);
  }
}
