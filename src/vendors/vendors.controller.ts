import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { UpdateVendorProfileDto, VendorNinVerifyDto, VendorCacVerifyDto } from './dto/vendor.dto';
import { VendorsService } from './vendors.service';

@ApiTags('Vendors')
@ApiCookieAuth('purse_access_token')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current vendor onboarding profile including KYC status' })
  @OkExample({
    id: 1,
    userId: 1001,
    phoneNumber: '+2348012345678',
    state: 'Lagos',
    city: 'Ikeja',
    address: '12 Allen Avenue',
    onboardingStatus: 'NIN_VERIFIED',
    documentReviewStatus: 'PENDING',
    ninVerification: { id: 1, status: 'APPROVED', qoreidStatus: 'VERIFIED' },
    cacVerification: null,
  })
  @StandardErrors()
  getMe(@CurrentUser('id') userId: number) {
    return this.vendorsService.getProfile(userId);
  }

  @Post('profile')
  @ApiOperation({ summary: 'Create or update vendor onboarding contact/address details' })
  @OkExample({
    id: 1,
    userId: 1001,
    phoneNumber: '+2348012345678',
    state: 'Lagos',
    onboardingStatus: 'PROFILE_COMPLETED',
    documentReviewStatus: 'PENDING',
  })
  @StandardErrors()
  updateProfile(@CurrentUser('id') userId: number, @Body() dto: UpdateVendorProfileDto) {
    return this.vendorsService.updateProfile(userId, dto);
  }

  // ─── KYC ─────────────────────────────────────────────────────────────────────

  @Post('kyc/nin')
  @ApiOperation({
    summary: 'Verify vendor NIN via QoreID',
    description:
      'Runs an automated NIN data check. If selfieBase64 is provided, a face-match is also performed. ' +
      'On a VERIFIED result with auto-approve enabled, onboardingStatus advances to NIN_VERIFIED.',
  })
  @OkExample({
    id: 1,
    status: 'APPROVED',
    qoreidStatus: 'VERIFIED',
    faceMatchScore: 96.4,
  })
  @StandardErrors()
  verifyNin(@CurrentUser('id') userId: number, @Body() dto: VendorNinVerifyDto) {
    return this.vendorsService.verifyNin(userId, dto);
  }

  @Post('kyc/cac')
  @ApiOperation({
    summary: 'Verify vendor business CAC registration via QoreID',
    description:
      'Runs an automated CAC Basic check using the business reg number. ' +
      'Set verifyTin: true in the body to also run an optional TIN lookup against the same reg number. ' +
      'On a VERIFIED result with auto-approve enabled, onboardingStatus advances to CAC_VERIFIED.',
  })
  @OkExample({
    id: 1,
    status: 'APPROVED',
    qoreidStatus: 'VERIFIED',
    companyName: 'Acme Nigeria Limited',
    companyType: 'Private Limited',
    incorporatedAt: '2018-04-15T00:00:00.000Z',
    tinVerified: true,
  })
  @StandardErrors()
  verifyCac(@CurrentUser('id') userId: number, @Body() dto: VendorCacVerifyDto) {
    return this.vendorsService.verifyCac(userId, dto);
  }

  @Post('submit')
  @ApiOperation({
    summary: 'Submit completed vendor onboarding for admin review',
    description:
      'Requires NIN and CAC verifications to be present. ' +
      'Sets onboardingStatus to UNDER_REVIEW and notifies the vendor.',
  })
  @OkExample({
    id: 1,
    onboardingStatus: 'UNDER_REVIEW',
    statusMessage: 'Your vendor application is under review.',
  })
  @StandardErrors()
  submit(@CurrentUser('id') userId: number) {
    return this.vendorsService.submitForReview(userId);
  }
}
