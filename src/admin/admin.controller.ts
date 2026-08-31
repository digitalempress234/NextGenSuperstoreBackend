import { Body, Controller, Get, Param, ParseIntPipe, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { RequirePermissions } from '../common/permissions.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { ReviewDocumentDto, ReviewRiderDto } from './dto/admin.dto';
import { AdminService } from './admin.service';

@ApiTags('Admin')
@ApiCookieAuth('purse_access_token')
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

  @Patch('riders/:id/approve')
  @RequirePermissions('kyc.review')
  @ApiOperation({ summary: 'Approve a rider after KYC review' })
  @ApiParam({ name: 'id', example: 50 })
  @OkExample({ id: 50, onboardingStatus: 'APPROVED' })
  @StandardErrors()
  approveRider(
    @Param('id', ParseIntPipe) riderId: number,
    @CurrentUser('id') reviewerId: number,
    @Body() dto: ReviewRiderDto,
  ) {
    return this.adminService.approveRider(riderId, reviewerId, dto.reason);
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
    @CurrentUser('id') reviewerId: number,
    @Body() dto: ReviewRiderDto,
  ) {
    return this.adminService.rejectRider(riderId, reviewerId, dto.reason);
  }

  @Patch('rider-documents/:id/review')
  @RequirePermissions('kyc.review')
  @ApiOperation({ summary: 'Approve or reject a rider KYC document' })
  @ApiParam({ name: 'id', example: 10 })
  @OkExample({ id: 10, type: 'NIN', status: 'APPROVED', reviewedAt: '2026-08-25T17:00:00.000Z' })
  @StandardErrors()
  reviewDocument(
    @Param('id', ParseIntPipe) documentId: number,
    @CurrentUser('id') reviewerId: number,
    @Body() dto: ReviewDocumentDto,
  ) {
    return this.adminService.reviewDocument(documentId, reviewerId, dto.status, dto.reason);
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
    @CurrentUser('id') reviewerId: number,
    @Body() dto: ReviewRiderDto, // We can reuse ReviewRiderDto for the reason field
  ) {
    return this.adminService.approveVendor(userId, reviewerId, dto.reason);
  }

  @Patch('vendors/:userId/reject')
  @RequirePermissions('merchants.approve')
  @ApiOperation({ summary: 'Reject a vendor profile' })
  @ApiParam({ name: 'userId', example: 1001 })
  @OkExample({ id: 5, userId: 1001, documentReviewStatus: 'REJECTED' })
  @StandardErrors()
  rejectVendor(
    @Param('userId', ParseIntPipe) userId: number,
    @CurrentUser('id') reviewerId: number,
    @Body() dto: ReviewRiderDto,
  ) {
    return this.adminService.rejectVendor(userId, reviewerId, dto.reason);
  }
}
