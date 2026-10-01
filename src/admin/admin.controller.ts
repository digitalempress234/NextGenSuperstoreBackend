import { Body, Controller, Get, Param, ParseIntPipe, Patch, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import {
  AdminUpdateOrderStatusDto,
  ReviewDocumentDto,
  RejectRiderDto,
  ReviewRiderDto,
  RiderApplicationDecisionDto,
} from './dto/admin.dto';
import { AdminService } from './admin.service';
import { AdminRoute } from '../auth/admin-route.decorator';
import { AuthenticatedStaff, StaffJwtGuard } from '../staff/staff-jwt.guard';
import { StaffPermissionGuard } from '../staff/staff-permission.guard';

@ApiTags('Admin')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard, StaffPermissionGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @RequirePermissions('reports.view')
  @ApiOperation({ summary: 'Get high-level statistics for the admin dashboard' })
  @OkExample(
    {
      totalUsers: 500,
      totalStores: 25,
      totalOrders: 1500,
      totalRevenue: 500000.0,
      pendingApprovals: 3,
    },
    'Admin overview statistics',
  )
  overview() {
    return this.adminService.overview();
  }

  @Patch('orders/:id/status')
  @RequirePermissions('orders.status.update')
  @ApiOperation({
    summary: 'Operations admin: exceptionally update an order status',
    description:
      'Uses the order state machine and requires an audit reason. This is an exception/reconciliation endpoint, not the normal vendor or rider workflow.',
  })
  @ApiParam({ name: 'id', example: 501 })
  @OkExample({ id: 501, currentStatus: 'COMPLETED' })
  @StandardErrors()
  updateOrderStatus(
    @Param('id', ParseIntPipe) orderId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: AdminUpdateOrderStatusDto,
  ) {
    return this.adminService.updateOrderStatus(orderId, req.staffUser.id, dto.status, dto.reason);
  }

  @Get('riders/review')
  @RequirePermissions('kyc.read')
  @ApiOperation({ summary: 'List riders currently under KYC review' })
  @OkExample([
    { id: 50, onboardingStatus: 'UNDER_REVIEW', user: { id: 1001, email: 'rider@example.com' } },
  ])
  @StandardErrors()
  listRidersForReview() {
    return this.adminService.listRidersForReview();
  }

  @Patch('riders/:id/decision')
  @RequirePermissions('kyc.review')
  @ApiOperation({
    summary: 'Approve or reject the complete motorcycle rider application',
    description:
      'Can approve pending motorcycle photo/plate and registration checks in the same transaction. It never overrides incomplete or failed automatic identity, driver-licence, or liveness checks. After commit, the rider receives an in-app notification and a dedicated decision email.',
  })
  @ApiParam({ name: 'id', example: 50 })
  @OkExample({ id: 50, onboardingStatus: 'APPROVED' })
  @StandardErrors()
  decideRiderApplication(
    @Param('id', ParseIntPipe) riderId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: RiderApplicationDecisionDto,
  ) {
    return this.adminService.decideRiderApplication(
      riderId,
      req.staffUser.id,
      dto.decision,
      dto.reason,
      dto.approvePendingManualChecks,
    );
  }

  @Patch('riders/:id/approve')
  @RequirePermissions('kyc.review')
  @ApiOperation({
    summary: 'Approve a rider after operational KYC review',
    description:
      'Legacy final approval route. Prefer PATCH /admin/riders/{id}/decision to review motorcycle evidence and decide atomically. Bank details and ownership evidence do not block normal approval.',
  })
  @ApiParam({ name: 'id', example: 50 })
  @OkExample({ id: 50, onboardingStatus: 'APPROVED' })
  @StandardErrors()
  approveRider(
    @Param('id', ParseIntPipe) riderId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: ReviewRiderDto,
  ) {
    return this.adminService.approveRider(riderId, req.staffUser.id, dto.reason);
  }

  @Patch('riders/:id/reject')
  @RequirePermissions('kyc.review')
  @ApiOperation({ summary: 'Reject rider onboarding with a reason' })
  @ApiParam({ name: 'id', example: 50 })
  @OkExample({
    id: 50,
    onboardingStatus: 'REJECTED',
    rejectionReason: 'Vehicle document is invalid.',
  })
  @StandardErrors()
  rejectRider(
    @Param('id', ParseIntPipe) riderId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: RejectRiderDto,
  ) {
    return this.adminService.rejectRider(riderId, req.staffUser.id, dto.reason);
  }

  @Patch('rider-documents/:id/review')
  @RequirePermissions('kyc.review')
  @ApiOperation({ summary: 'Approve or reject a rider KYC document' })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({ id: 10, type: 'NIN', status: 'APPROVED', reviewedAt: '2026-08-25T17:00:00.000Z' })
  @StandardErrors()
  reviewDocument(
    @Param('id', ParseIntPipe) documentId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.adminService.reviewDocument(documentId, req.staffUser.id, dto.status, dto.reason);
  }

  @Patch('rider-licences/:id/review')
  @RequirePermissions('kyc.review')
  @ApiOperation({
    summary: 'Review a legacy rider/driving licence record',
    description:
      'Cannot manually approve a provider-backed record unless Identro already returned VERIFIED.',
  })
  @ApiParam({ name: 'id', example: 21 })
  @StandardErrors()
  reviewRiderLicence(
    @Param('id', ParseIntPipe) licenceId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.adminService.reviewRiderLicence(
      licenceId,
      req.staffUser.id,
      dto.status,
      dto.reason,
    );
  }

  @Patch('vehicle-documents/:id/review')
  @RequirePermissions('kyc.review')
  @ApiOperation({ summary: 'Approve or reject a rider vehicle document' })
  @ApiParam({ name: 'id', example: 22 })
  @StandardErrors()
  reviewVehicleDocument(
    @Param('id', ParseIntPipe) documentId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.adminService.reviewVehicleDocument(
      documentId,
      req.staffUser.id,
      dto.status,
      dto.reason,
    );
  }

  @Patch('vehicles/:id/review')
  @RequirePermissions('kyc.review')
  @ApiOperation({ summary: 'Approve or reject the motorcycle photo and visible plate details' })
  @ApiParam({ name: 'id', example: 20 })
  @StandardErrors()
  reviewVehicle(
    @Param('id', ParseIntPipe) vehicleId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.adminService.reviewVehicle(vehicleId, req.staffUser.id, dto.status, dto.reason);
  }

  @Patch('rider-liveness/:id/review')
  @RequirePermissions('kyc.review')
  @ApiOperation({ summary: 'Approve or reject a completed rider liveness session' })
  @ApiParam({ name: 'id', example: 23 })
  @StandardErrors()
  reviewRiderLiveness(
    @Param('id', ParseIntPipe) livenessId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.adminService.reviewLiveness(livenessId, req.staffUser.id, dto.status, dto.reason);
  }

  @Patch('guarantor-documents/:id/review')
  @RequirePermissions('kyc.review')
  @ApiOperation({ summary: 'Approve or reject a conditional guarantor identity document' })
  @ApiParam({ name: 'id', example: 41 })
  @StandardErrors()
  reviewGuarantorDocument(
    @Param('id', ParseIntPipe) documentId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.adminService.reviewGuarantorDocument(
      documentId,
      req.staffUser.id,
      dto.status,
      dto.reason,
    );
  }

  @Patch('stores/:id/activate')
  @RequirePermissions('stores.activate')
  @ApiOperation({ summary: 'Activate a merchant store after onboarding review' })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({ id: 10, storeName: 'Purse Supermarket Ikeja', isActive: true })
  @StandardErrors()
  activateStore(@Param('id', ParseIntPipe) storeId: number) {
    return this.adminService.activateStore(storeId);
  }

  @Patch('vendors/:userId/approve')
  @RequirePermissions('merchants.approve')
  @ApiOperation({ summary: 'Approve a vendor profile and assign VENDOR role' })
  @ApiParam({ name: 'userId', example: 1001 })
  @OkExample({ id: 5, userId: 1001, documentReviewStatus: 'APPROVED' })
  @StandardErrors()
  approveVendor(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: ReviewRiderDto,
  ) {
    return this.adminService.approveVendor(userId, req.staffUser.id, dto.reason);
  }

  @Patch('vendors/:userId/reject')
  @RequirePermissions('merchants.approve')
  @ApiOperation({ summary: 'Reject a vendor profile' })
  @ApiParam({ name: 'userId', example: 1001 })
  @OkExample({ id: 5, userId: 1001, documentReviewStatus: 'REJECTED' })
  @StandardErrors()
  rejectVendor(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: { staffUser: AuthenticatedStaff },
    @Body() dto: ReviewRiderDto,
  ) {
    return this.adminService.rejectVendor(userId, req.staffUser.id, dto.reason);
  }
}
