import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCookieAuth,
  ApiExtraModels,
  ApiOperation,
  ApiTags,
  getSchemaPath,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AdminRoute } from '../auth/admin-route.decorator';
import { CurrentUser } from '../common/current-user.decorator';
import { CreatedExample, OkExample, StandardErrors } from '../common/api-docs';
import { PaginationDto } from '../common/dto/pagination.dto';
import { StaffJwtGuard, AuthenticatedStaff } from '../staff/staff-jwt.guard';
import { assertCheckoutStaff } from '../checkout/checkout-settings.controller';
import { BnplPlanDto, UpdateBnplPlanDto } from '../checkout/checkout-settings.dto';
import { ApplyBnplDto, BnplPlansQuery, ConfirmBnplDto, ReviewBnplDto } from './bnpl.dto';
import { BnplService } from './bnpl.service';

@ApiTags('BNPL')
@ApiCookieAuth('purse_access_token')
@Controller('bnpl')
export class BnplController {
  constructor(private readonly bnpl: BnplService) {}
  @Get('installment-plans')
  @ApiOperation({ summary: 'List configured active financing plans for the current cart' })
  @OkExample({
    provider: 'wallet_bnpl',
    cartTotal: '120000.00',
    currency: 'NGN',
    plans: [
      {
        id: 1,
        label: '3 months',
        principal: '120000.00',
        months: 3,
        interestRate: '0.00',
        totalPayable: '120000.00',
        monthlyAmount: '40000.00',
        finalInstallment: '40000.00',
      },
    ],
  })
  @StandardErrors()
  plans(@CurrentUser('id') userId: number, @Query() query: BnplPlansQuery) {
    return this.bnpl.plans(userId, query.provider, query.cartId);
  }
  @Post('apply')
  @ApiOperation({
    summary: 'Submit a BNPL application with a verification document',
    description:
      'Records consent and encrypted bank/document data. It does not create a bank mandate. Staff approval is required before confirmation.',
  })
  @CreatedExample({
    applicationId: 123,
    status: 'pending_review',
    cartId: 12,
    planId: 1,
    accountNumber: '******8765',
    documentUploaded: true,
    nibssConsent: true,
  })
  @StandardErrors()
  @ApiConsumes('multipart/form-data')
  @ApiExtraModels(ApplyBnplDto)
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApplyBnplDto) },
        {
          type: 'object',
          required: ['document'],
          properties: { document: { type: 'string', format: 'binary' } },
        },
      ],
    },
  })
  @UseInterceptors(
    FileInterceptor('document', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 20 } }),
  )
  apply(
    @CurrentUser('id') userId: number,
    @Body() dto: ApplyBnplDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.bnpl.apply(userId, dto, file);
  }
  @Post('confirm')
  @ApiOperation({
    summary: 'Confirm an approved BNPL application and place store orders',
    description:
      'Returns application and checkout objects. Confirmation is unavailable before staff approval or when the cart or quote changes.',
  })
  @CreatedExample({
    application: { applicationId: 123, status: 'confirmed', plan: { months: 3, schedule: [] } },
    checkout: {
      paymentGroupId: 20,
      paymentStatus: 'paid',
      orders: [{ id: 101, orderNumber: 'PUR-...' }],
    },
  })
  @StandardErrors()
  confirm(@CurrentUser('id') userId: number, @Body() dto: ConfirmBnplDto) {
    return this.bnpl.confirm(userId, dto.applicationId);
  }
  @Get('applications')
  @ApiOperation({ summary: 'List the customer’s BNPL applications and review statuses' })
  mine(@CurrentUser('id') userId: number) {
    return this.bnpl.mine(userId);
  }
  @Get('applications/:id')
  @ApiOperation({ summary: 'Get a BNPL application, approved terms, and installment schedule' })
  get(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.bnpl.get(userId, id);
  }
  @Post('applications/:id/cancel')
  @ApiOperation({ summary: 'Cancel a pending or approved BNPL application' })
  cancel(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.bnpl.cancel(userId, id);
  }
}

@ApiTags('BNPL administration')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard)
@Controller('admin/bnpl')
export class BnplAdminController {
  constructor(private readonly bnpl: BnplService) {}
  @Get('plans')
  @ApiOperation({ summary: 'List BNPL plans, including disabled plans' })
  plans(@Req() req: { staffUser: AuthenticatedStaff }) {
    assertCheckoutStaff(req.staffUser, ['CREDIT_BNPL_ADMIN', 'FINANCE_ADMIN']);
    return this.bnpl.allPlans();
  }
  @Post('plans')
  @ApiOperation({ summary: 'Create a BNPL plan; no sample rates are enabled by default' })
  create(@Req() req: { staffUser: AuthenticatedStaff }, @Body() dto: BnplPlanDto) {
    assertCheckoutStaff(req.staffUser, ['CREDIT_BNPL_ADMIN']);
    return this.bnpl.savePlan(req.staffUser.id, dto);
  }
  @Patch('plans/:id')
  @ApiOperation({ summary: 'Update or disable a BNPL plan' })
  update(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateBnplPlanDto,
  ) {
    assertCheckoutStaff(req.staffUser, ['CREDIT_BNPL_ADMIN']);
    return this.bnpl.savePlan(req.staffUser.id, dto, id);
  }
  @Get('applications')
  @ApiOperation({ summary: 'List BNPL applications for staff review' })
  list(@Req() req: { staffUser: AuthenticatedStaff }, @Query() query: PaginationDto) {
    assertCheckoutStaff(req.staffUser, ['CREDIT_BNPL_ADMIN', 'RISK_COMPLIANCE_ADMIN']);
    return this.bnpl.applications(query.page, query.limit);
  }
  @Patch('applications/:id/review')
  @ApiOperation({ summary: 'Approve or reject a BNPL application' })
  review(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReviewBnplDto,
  ) {
    assertCheckoutStaff(req.staffUser, ['CREDIT_BNPL_ADMIN']);
    return this.bnpl.review(req.staffUser, id, dto);
  }
  @Get('applications/:id/document')
  @ApiOperation({ summary: 'Download an encrypted applicant document with audit logging' })
  async document(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Res({ passthrough: true }) response: Response,
  ) {
    assertCheckoutStaff(req.staffUser, ['CREDIT_BNPL_ADMIN', 'RISK_COMPLIANCE_ADMIN']);
    const document = await this.bnpl.document(req.staffUser.id, id);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(document.buffer, {
      type: document.mime,
      disposition: 'attachment; filename="' + document.name + '"',
    });
  }
}
