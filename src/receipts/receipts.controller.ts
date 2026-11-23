import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';

import { AdminRoute } from '../auth/admin-route.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { RequirePermissions } from '../common/permissions.decorator';
import { AuthenticatedStaff, StaffJwtGuard } from '../staff/staff-jwt.guard';
import { ReceiptQueryDto } from './dto/receipt-query.dto';
import { ReceiptEmailSettingsDto } from './dto/receipt-settings.dto';
import { ReceiptSettingsService } from './receipt-settings.service';
import { ReceiptsService } from './receipts.service';

const RECEIPT_EXAMPLE = {
  id: 12,
  receiptNumber: 'OHO-R-261121-A1B2C3D4',
  status: 'ISSUED',
  scope: 'CUSTOMER',
  currency: 'NGN',
  customer: {
    id: 8,
    name: 'Ada Customer',
    email: 'ada@example.com',
    phone: '+2348012345678',
  },
  payment: {
    id: 31,
    method: 'CARD',
    provider: 'PAYSTACK',
    reference: 'PUR-20-reference',
    paidAt: '2026-11-21T10:00:00.000Z',
  },
  orders: [
    {
      id: 501,
      orderNumber: 'PUR-261121-A1B2C3D4',
      store: { id: 6, name: 'Campus Hub' },
      items: [
        {
          id: 1,
          name: 'Rice 5kg',
          quantity: 1,
          unitPrice: '12000.00',
          total: '12000.00',
        },
      ],
      subtotal: '12000.00',
      shippingFee: '1500.00',
      discountAmount: '0.00',
      taxAmount: '0.00',
      total: '13500.00',
    },
  ],
  totals: {
    subtotal: '12000.00',
    shippingFee: '1500.00',
    discountAmount: '0.00',
    taxAmount: '0.00',
    totalAmount: '13500.00',
  },
  refunds: [],
  issuedAt: '2026-11-21T10:00:02.000Z',
  pdfUrl: '/purse/v1/receipts/OHO-R-261121-A1B2C3D4/pdf',
};

function sendPdf(response: Response, receiptNumber: string, document: Buffer) {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader(
    'Content-Disposition',
    `attachment; filename="OhoO-Receipt-${receiptNumber}.pdf"`,
  );
  response.setHeader('Cache-Control', 'private, no-store');
  response.send(document);
}

@ApiTags('Receipts')
@ApiCookieAuth('purse_access_token')
@ApiBearerAuth('mobile_bearer')
@Controller('receipts')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  @ApiOperation({
    summary: 'Customer: list payment receipts',
    description:
      'Returns immutable receipts for confirmed checkout payments. Historical paid checkouts are issued lazily and the default and maximum page size is 15.',
  })
  @OkExample(
    { items: [RECEIPT_EXAMPLE], total: 1, page: 1, limit: 15, pages: 1 },
    'Paginated customer receipts',
  )
  @StandardErrors()
  list(@CurrentUser('id') userId: number, @Query() query: ReceiptQueryDto) {
    return this.receipts.listForCustomer(userId, query.page, query.limit, query.status);
  }

  @Get(':receiptNumber/pdf')
  @ApiOperation({ summary: 'Customer: download an OhoO! receipt as PDF' })
  @ApiParam({ name: 'receiptNumber', example: 'OHO-R-261121-A1B2C3D4' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Branded OhoO! receipt PDF' })
  @StandardErrors()
  async pdf(
    @CurrentUser('id') userId: number,
    @Param('receiptNumber') receiptNumber: string,
    @Res() response: Response,
  ) {
    sendPdf(response, receiptNumber, await this.receipts.customerPdf(userId, receiptNumber));
  }

  @Get(':receiptNumber')
  @ApiOperation({ summary: 'Customer: get a payment receipt' })
  @ApiParam({ name: 'receiptNumber', example: 'OHO-R-261121-A1B2C3D4' })
  @OkExample(RECEIPT_EXAMPLE, 'Receipt detail')
  @StandardErrors()
  one(@CurrentUser('id') userId: number, @Param('receiptNumber') receiptNumber: string) {
    return this.receipts.getForCustomer(userId, receiptNumber);
  }
}

@ApiTags('Receipts')
@ApiCookieAuth('purse_access_token')
@ApiBearerAuth('mobile_bearer')
@Controller('orders')
export class OrderReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get(':id/receipt')
  @ApiOperation({
    summary: 'Customer: get the receipt associated with an order',
    description:
      'For multi-store checkout, every order points to the same consolidated payment receipt, with line items grouped by store.',
  })
  @ApiParam({ name: 'id', example: 501 })
  @OkExample(RECEIPT_EXAMPLE, 'Order payment receipt')
  @StandardErrors()
  byOrder(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) orderId: number) {
    return this.receipts.getForOrder(userId, orderId);
  }
}

@ApiTags('Store receipts')
@ApiCookieAuth('purse_access_token')
@ApiBearerAuth('mobile_bearer')
@Controller('stores/:storeId/receipts')
export class StoreReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  @Get()
  @RequirePermissions('orders.view')
  @ApiOperation({
    summary: 'Vendor/store staff: list receipt allocations for a store',
    description:
      'Only the selected store order and totals are returned; other stores in a consolidated checkout remain private.',
  })
  @OkExample(
    {
      items: [{ ...RECEIPT_EXAMPLE, scope: 'STORE', pdfUrl: undefined }],
      total: 1,
      page: 1,
      limit: 15,
      pages: 1,
    },
    'Paginated store receipt allocations',
  )
  @StandardErrors()
  list(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Query() query: ReceiptQueryDto,
  ) {
    return this.receipts.listForStore(userId, storeId, query.page, query.limit, query.status);
  }

  @Get(':receiptNumber')
  @RequirePermissions('orders.view')
  @ApiOperation({ summary: 'Vendor/store staff: get a store-scoped receipt allocation' })
  @OkExample({ ...RECEIPT_EXAMPLE, scope: 'STORE', pdfUrl: undefined }, 'Store receipt allocation')
  @StandardErrors()
  one(
    @CurrentUser('id') userId: number,
    @Param('storeId', ParseIntPipe) storeId: number,
    @Param('receiptNumber') receiptNumber: string,
  ) {
    return this.receipts.getForStore(userId, storeId, receiptNumber);
  }
}

@ApiTags('Admin receipts')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard)
@Controller('admin/receipts')
export class AdminReceiptsController {
  constructor(
    private readonly receipts: ReceiptsService,
    private readonly settings: ReceiptSettingsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Superadmin: list issued payment receipts' })
  @OkExample(
    { items: [RECEIPT_EXAMPLE], total: 1, page: 1, limit: 15, pages: 1 },
    'Paginated receipt directory',
  )
  list(@Req() request: { staffUser: AuthenticatedStaff }, @Query() query: ReceiptQueryDto) {
    this.authorize(request.staffUser);
    return this.receipts.listForAdmin(query.page, query.limit, query.status, query.userId);
  }

  @Get('settings')
  @ApiOperation({
    summary: 'Superadmin: read receipt email settings',
    description: 'PDF receipt attachments are enabled by default until explicitly disabled.',
  })
  @OkExample({ attachPdfToEmail: true }, 'Receipt email settings')
  getSettings(@Req() request: { staffUser: AuthenticatedStaff }) {
    this.authorize(request.staffUser);
    return this.settings.settings();
  }

  @Patch('settings')
  @ApiOperation({
    summary: 'Superadmin: enable or disable PDF attachments on receipt emails',
  })
  @OkExample({ attachPdfToEmail: false }, 'Updated receipt email settings')
  updateSettings(
    @Req() request: { staffUser: AuthenticatedStaff },
    @Body() dto: ReceiptEmailSettingsDto,
  ) {
    this.authorize(request.staffUser);
    return this.settings.update(request.staffUser.id, dto);
  }

  @Get(':receiptNumber/pdf')
  @ApiOperation({ summary: 'Superadmin: download an OhoO! receipt as PDF' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'Branded OhoO! receipt PDF' })
  async pdf(
    @Req() request: { staffUser: AuthenticatedStaff },
    @Param('receiptNumber') receiptNumber: string,
    @Res() response: Response,
  ) {
    this.authorize(request.staffUser);
    sendPdf(response, receiptNumber, await this.receipts.adminPdf(receiptNumber));
  }

  @Post(':receiptNumber/resend')
  @ApiOperation({
    summary: 'Superadmin: resend a receipt email to its customer',
    description:
      'The PDF copy is attached or omitted according to the current receipt email setting.',
  })
  @OkExample(
    {
      receiptNumber: 'OHO-R-261121-A1B2C3D4',
      sentTo: 'ada@example.com',
      pdfAttached: true,
    },
    'Receipt email resent',
  )
  resend(
    @Req() request: { staffUser: AuthenticatedStaff },
    @Param('receiptNumber') receiptNumber: string,
  ) {
    this.authorize(request.staffUser);
    return this.receipts.resend(receiptNumber);
  }

  @Get(':receiptNumber')
  @ApiOperation({ summary: 'Superadmin: get a payment receipt' })
  @OkExample(RECEIPT_EXAMPLE, 'Receipt detail')
  one(
    @Req() request: { staffUser: AuthenticatedStaff },
    @Param('receiptNumber') receiptNumber: string,
  ) {
    this.authorize(request.staffUser);
    return this.receipts.getForAdmin(receiptNumber);
  }

  private authorize(staff: AuthenticatedStaff) {
    if (staff.role !== 'SUPER_ADMIN') {
      throw new ForbiddenException('SUPER_ADMIN access is required.');
    }
  }
}
