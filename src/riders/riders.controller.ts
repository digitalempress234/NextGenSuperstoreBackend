import { Body, Controller, Get, ParseIntPipe, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import {
  CreateBankAccountDto,
  CreateGuarantorDto,
  CreateRiderDocumentDto,
  CreateVehicleDto,
  MintKycSessionDto,
  UpdateRiderProfileDto,
  VerifyGuarantorDocumentDto,
  VerifyRiderDocumentDto,
} from './dto/rider.dto';
import { RidersService } from './riders.service';
import { BankResolverService } from './bank-resolver.service';
import { RiderWalletService, RiderWithdrawDto } from './rider-wallet.service';

@ApiTags('Riders')
@ApiCookieAuth('purse_access_token')
@Controller('riders')
export class RidersController {
  constructor(
    private readonly ridersService: RidersService,
    private readonly banks: BankResolverService,
    private readonly riderWallet: RiderWalletService,
  ) {}

  @Get('onboarding/requirements')
  @ApiOperation({ summary: 'Get rider onboarding document requirements and field guidance' })
  @OkExample({
    message: 'Your Account is Under Review',
    requiredDocuments: [
      {
        type: 'NIN',
        description:
          'National Identification Number slip/card or another approved government-issued ID.',
      },
      { type: 'PASSPORT_PHOTO', description: 'Recent passport-style profile photograph.' },
      {
        type: 'LIVENESS',
        description:
          'Live selfie/liveness verification completed through the supported verification flow.',
      },
      {
        type: 'DRIVERS_LICENSE',
        description: 'Valid rider/motorcycle or applicable driving licence.',
      },
      {
        type: 'VEHICLE_REGISTRATION',
        description: 'Current vehicle registration document for the motorcycle/vehicle being used.',
      },
      {
        type: 'PROOF_OF_OWNERSHIP_OR_PERMISSION',
        description: 'Proof of ownership or written authorization to use the vehicle.',
      },
      { type: 'VEHICLE_LICENSE', description: 'Current vehicle licence.' },
      { type: 'INSURANCE', description: 'Valid insurance certificate where applicable.' },
      {
        type: 'ROADWORTHINESS_CERTIFICATE',
        description: 'Current roadworthiness certificate where applicable.',
      },
      {
        type: 'VEHICLE_PHOTO',
        description: 'Clear photographs of the motorcycle/vehicle and plate number.',
      },
      { type: 'GUARANTOR_ID', description: 'Government-issued identification for the guarantor.' },
    ],
    profileMessage: 'Your Account is Under Review',
  })
  @StandardErrors()
  getRequirements() {
    return this.ridersService.getOnboardingRequirements();
  }

  @Get('banks')
  @ApiOperation({ summary: 'List supported Nigerian payout banks for searchable dropdowns' })
  @OkExample([{ name: 'Access Bank', code: '044', active: true }])
  @StandardErrors()
  listBanks() {
    return this.banks.listBanks();
  }

  @Post('bank-accounts/resolve')
  @ApiOperation({
    summary: 'Resolve rider bank account automatically before saving payout details',
  })
  @OkExample({ accountNumber: '0123456789', accountName: 'Tony Stark', bankId: 9 })
  @StandardErrors()
  resolveBankAccount(@Body() dto: CreateBankAccountDto) {
    return this.banks.resolveAccount(dto.bankCode, dto.accountNumber);
  }

  @Get('me')
  @ApiOperation({ summary: 'Get the current rider onboarding profile and related KYC data' })
  @OkExample({
    id: 50,
    userId: 1001,
    onboardingStatus: 'UNDER_REVIEW',
    documents: [{ type: 'NIN', status: 'PENDING' }],
    vehicles: [{ plateNumber: 'LAG-123-XY', status: 'PENDING' }],
    bankAccounts: [{ bankName: 'GTBank', verificationStatus: 'PENDING' }],
    guarantors: [],
  })
  @StandardErrors()
  getMe(@CurrentUser('id') userId: number) {
    return this.ridersService.getProfile(userId);
  }

  @Post('profile')
  @ApiOperation({ summary: 'Create or update rider profile details' })
  @OkExample({ id: 50, areaOfOperation: 'Ikeja', onboardingStatus: 'PROFILE_COMPLETED' })
  @StandardErrors()
  updateProfile(@CurrentUser('id') userId: number, @Body() dto: UpdateRiderProfileDto) {
    return this.ridersService.updateProfile(userId, dto);
  }

  @Post('documents')
  @ApiOperation({ summary: 'Attach an identity/KYC document' })
  @OkExample({ id: 10, type: 'NIN', status: 'PENDING', expiryDate: null })
  @StandardErrors()
  addDocument(@CurrentUser('id') userId: number, @Body() dto: CreateRiderDocumentDto) {
    return this.ridersService.addDocument(userId, dto);
  }

  @Post('vehicles')
  @ApiOperation({ summary: 'Register a motorcycle or vehicle' })
  @OkExample({ id: 20, plateNumber: 'LAG-123-XY', ownershipType: 'OWNED', status: 'PENDING' })
  @StandardErrors()
  addVehicle(@CurrentUser('id') userId: number, @Body() dto: CreateVehicleDto) {
    return this.ridersService.addVehicle(userId, dto);
  }

  @Post('bank-accounts')
  @ApiOperation({ summary: 'Add a rider payout bank account' })
  @OkExample({
    id: 30,
    bankName: 'GTBank',
    accountName: 'Tony Stark',
    verificationStatus: 'PENDING',
  })
  @StandardErrors()
  addBankAccount(@CurrentUser('id') userId: number, @Body() dto: CreateBankAccountDto) {
    return this.ridersService.addBankAccount(userId, dto);
  }

  @Post('guarantors')
  @ApiOperation({ summary: 'Add a guarantor to rider onboarding' })
  @OkExample({ id: 40, fullName: 'John Guarantor', relationship: 'Brother', status: 'PENDING' })
  @StandardErrors()
  addGuarantor(@CurrentUser('id') userId: number, @Body() dto: CreateGuarantorDto) {
    return this.ridersService.addGuarantor(userId, dto);
  }

  @Post('submit')
  @ApiOperation({ summary: 'Submit completed rider onboarding for review' })
  @OkExample({
    id: 50,
    onboardingStatus: 'UNDER_REVIEW',
    statusMessage: 'Your Account is Under Review',
    canSubmit: false,
  })
  @StandardErrors()
  submitForReview(@CurrentUser('id') userId: number) {
    return this.ridersService.submitForReview(userId);
  }

  

  @Post('kyc/session')
  @ApiOperation({
    summary: 'Mint an Identro liveness SDK session for biometric verification',
    description:
      'Backend-only call to Identro. Returns only the session reference — credentials never reach the client.',
  })
  @OkExample({
    reference: '<session reference returned to mobile SDK>',
    status: 'PENDING',
  })
  @StandardErrors()
  mintKycSession(@CurrentUser('id') userId: number, @Body() dto: MintKycSessionDto) {
    return this.ridersService.mintKycSession(userId, dto);
  }

  @Post('kyc/verify-document')
  @ApiOperation({
    summary: 'Trigger automated Identro identity verification for a rider document',
    description:
      'Calls the appropriate Identro endpoint based on document type. Optionally runs a face-match if selfieBase64 is provided.',
  })
  @OkExample({
    id: 10,
    type: 'NIN',
    status: 'APPROVED',
    qoreidStatus: 'VERIFIED',
    faceMatchScore: 97.4,
  })
  @StandardErrors()
  verifyRiderDocument(@CurrentUser('id') userId: number, @Body() dto: VerifyRiderDocumentDto) {
    return this.ridersService.verifyRiderDocument(userId, dto);
  }

  @Post('kyc/verify-guarantor-document')
  @ApiOperation({
    summary: 'Trigger automated Identro name/ID check on a guarantor document',
    description: 'No face-match — the guarantor is not present during onboarding.',
  })
  @OkExample({ id: 5, type: 'NIN', status: 'APPROVED', qoreidStatus: 'VERIFIED' })
  @StandardErrors()
  verifyGuarantorDocument(
    @CurrentUser('id') userId: number,
    @Body() dto: VerifyGuarantorDocumentDto,
  ) {
    return this.ridersService.verifyGuarantorDocument(userId, dto);
  }

  

  @Get('wallet')
  @ApiOperation({ summary: 'Get rider wallet balance (available + held delivery fees)' })
  @OkExample({ balance: 12500, heldBalance: 1000, availableBalance: 12500 })
  @StandardErrors()
  getWallet(@CurrentUser('id') userId: number) {
    return this.riderWallet.getWallet(userId);
  }

  @Get('wallet/transactions')
  @ApiOperation({ summary: 'Get rider wallet transaction ledger' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @OkExample({ items: [], total: 0, page: 1, limit: 10 })
  @StandardErrors()
  getTransactions(
    @CurrentUser('id') userId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 10,
  ) {
    return this.riderWallet.getTransactions(userId, page, limit);
  }

  @Post('wallet/withdraw')
  @ApiOperation({
    summary: "Request a withdrawal to the rider's primary bank account",
    description:
      'MANUAL mode creates a pending request for admin processing. AUTO mode triggers an immediate Paystack transfer.',
  })
  @OkExample({ id: 1, amount: 5000, status: 'PENDING', mode: 'MANUAL', bankName: 'GTBank' })
  @StandardErrors()
  requestWithdrawal(@CurrentUser('id') userId: number, @Body() dto: RiderWithdrawDto) {
    return this.riderWallet.requestWithdrawal(userId, dto);
  }

  @Get('wallet/withdrawals')
  @ApiOperation({ summary: 'List rider withdrawal history' })
  @OkExample([{ id: 1, amount: 5000, status: 'PAID', mode: 'MANUAL', bankName: 'GTBank' }])
  @StandardErrors()
  getWithdrawals(@CurrentUser('id') userId: number) {
    return this.riderWallet.getWithdrawals(userId);
  }
}
