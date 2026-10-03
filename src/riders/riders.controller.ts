import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import {
  CreateBankAccountDto,
  CreateGuarantorDocumentDto,
  CreateGuarantorDto,
  CreateRiderLicenceDto,
  CreateRiderDocumentDto,
  CreateVehicleDocumentDto,
  CreateVehicleDto,
  MintKycSessionDto,
  ReplaceVehicleDocumentDto,
  UpdateRiderProfileDto,
  UpdateRiderSettingsDto,
  UpdateVehicleDto,
  VerifyGuarantorDocumentDto,
  VerifyDriverLicenseDto,
  VerifyRiderDocumentDto,
} from './dto/rider.dto';
import { RidersService } from './riders.service';
import { BankResolverService } from './bank-resolver.service';
import { RiderWalletService } from './rider-wallet.service';
import { RiderWithdrawDto } from './dto/rider-wallet.dto';
import { RIDER_INBOX_EXAMPLE, RIDER_SETTINGS_EXAMPLE } from '../common/docs-examples';

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
  @ApiOperation({
    summary: 'Get progressive rider KYC stages and conditional requirements',
    description:
      'APPLICATION is the short submission checklist. OPERATIONAL_APPROVAL gates live deliveries. CONDITIONAL_REVIEW contains risk-based checks.',
  })
  @OkExample({
    strategy: 'PROGRESSIVE_KYC',
    stages: [
      {
        key: 'APPLICATION',
        label: 'Quick application',
        requirements: [
          { key: 'identity', label: 'Government identity number', required: true },
          { key: 'liveness', label: 'Liveness-only verification', required: true },
          { key: 'driverLicence', label: 'Automatic driver licence verification', required: true },
          { key: 'motorcycle', label: 'Motorcycle photo, plate, and registration', required: true },
        ],
      },
      {
        key: 'OPERATIONAL_APPROVAL',
        label: 'Operational verification',
        requirements: [
          {
            key: 'riderLicence',
            label: 'Driving/rider licence',
            required: 'MOTORIZED_VEHICLES_ONLY',
          },
        ],
      },
    ],
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
    areaOfOperation: 'Ikeja',
    emergencyContactName: 'Jane Doe',
    emergencyContactPhone: '+2348088888888',
    onboardingStatus: 'UNDER_REVIEW',
    documents: [{ type: 'NIN', status: 'APPROVED' }],
    licences: [{ number: 'AAA00000AA00', providerStatus: 'VERIFIED', status: 'APPROVED' }],
    liveness: [{ status: 'PENDING' }],
    vehicles: [
      {
        plateNumber: 'LAG-123-XY',
        status: 'PENDING',
        documents: [{ type: 'VEHICLE_REGISTRATION', status: 'PENDING' }],
      },
    ],
    bankAccounts: [],
    guarantors: [],
    canSubmit: false,
    canAcceptDeliveries: false,
    missingApplicationRequirements: [],
    missingOperationalRequirements: ['APPROVED_LIVENESS', 'OPERATIONALLY_APPROVED_VEHICLE'],
  })
  @StandardErrors()
  getMe(@CurrentUser('id') userId: number) {
    return this.ridersService.getProfile(userId);
  }

  @Get('inbox')
  @ApiOperation({ summary: 'Logistics/rider: get paginated operational inbox' })
  @OkExample(RIDER_INBOX_EXAMPLE, 'Paginated rider operational inbox')
  inbox(
    @CurrentUser('id') userId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 15,
  ) {
    return this.ridersService.inbox(userId, page, Math.min(limit, 100));
  }

  @Get('settings')
  @ApiOperation({ summary: 'Logistics/rider: get profile and notification settings' })
  @OkExample(RIDER_SETTINGS_EXAMPLE, 'Rider profile and notification settings')
  settings(@CurrentUser('id') userId: number) {
    return this.ridersService.settings(userId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Logistics/rider: update profile and notification settings' })
  @OkExample(RIDER_SETTINGS_EXAMPLE, 'Updated rider profile and notification settings')
  @StandardErrors()
  updateSettings(@CurrentUser('id') userId: number, @Body() dto: UpdateRiderSettingsDto) {
    return this.ridersService.updateSettings(userId, dto);
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

  @Patch('vehicles/:vehicleId')
  @ApiOperation({
    summary: 'Correct pending or rejected motorcycle details and photo',
    description:
      'Available while the application is editable. Any correction returns the motorcycle evidence to PENDING for staff review.',
  })
  @ApiParam({ name: 'vehicleId', example: 20 })
  @StandardErrors()
  updateVehicle(
    @CurrentUser('id') userId: number,
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Body() dto: UpdateVehicleDto,
  ) {
    return this.ridersService.updateVehicle(userId, vehicleId, dto);
  }

  @Post('licences')
  @ApiOperation({
    summary: 'Attach a legacy licence image',
    description:
      'Legacy/manual fallback. New mobile integrations should use POST /riders/driver-license/verify.',
    deprecated: true,
  })
  @OkExample({ id: 21, type: 'DRIVERS_LICENSE', status: 'PENDING' })
  @StandardErrors()
  addLicence(@CurrentUser('id') userId: number, @Body() dto: CreateRiderLicenceDto) {
    return this.ridersService.addLicence(userId, dto);
  }

  @Post('driver-license/verify')
  @ApiOperation({
    summary: 'Automatically verify a Nigerian driver licence with Identro',
    description:
      'The backend supplies DRIVER_LICENSE_VERIFICATION and provider credentials. Explicit rider consent and an idempotency key are mandatory.',
  })
  @OkExample({
    id: 21,
    type: 'DRIVERS_LICENSE',
    number: 'AAA00000AA00',
    provider: 'identro',
    providerStatus: 'VERIFIED',
    status: 'APPROVED',
  })
  @StandardErrors()
  verifyDriverLicense(@CurrentUser('id') userId: number, @Body() dto: VerifyDriverLicenseDto) {
    return this.ridersService.verifyDriverLicense(userId, dto);
  }

  @Post('driver-license/requests')
  @ApiOperation({ summary: 'Create a tracked Identro driver-licence verification request' })
  @StandardErrors()
  createDriverLicenseRequest(
    @CurrentUser('id') userId: number,
    @Body() dto: VerifyDriverLicenseDto,
  ) {
    return this.ridersService.verifyDriverLicense(userId, dto, true);
  }

  @Get('driver-license/requests')
  @ApiOperation({ summary: "List the current rider's driver-licence verification history" })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 15 })
  @StandardErrors()
  listDriverLicenseRequests(
    @CurrentUser('id') userId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 15,
  ) {
    return this.ridersService.listDriverLicenseRequests(userId, page, Math.min(limit, 100));
  }

  @Get('driver-license/requests/:reference')
  @ApiOperation({ summary: 'Refresh one owned driver-licence request from Identro' })
  @ApiParam({ name: 'reference', example: 'DL-IDENTRO-001' })
  @StandardErrors()
  syncDriverLicenseRequest(
    @CurrentUser('id') userId: number,
    @Param('reference') reference: string,
  ) {
    return this.ridersService.syncDriverLicenseRequest(userId, reference);
  }

  @Post('vehicles/:vehicleId/documents')
  @ApiOperation({ summary: 'Attach registration or lawful-use evidence to a rider vehicle' })
  @ApiParam({ name: 'vehicleId', example: 20 })
  @OkExample({ id: 22, type: 'VEHICLE_REGISTRATION', status: 'PENDING' })
  @StandardErrors()
  addVehicleDocument(
    @CurrentUser('id') userId: number,
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Body() dto: CreateVehicleDocumentDto,
  ) {
    return this.ridersService.addVehicleDocument(userId, vehicleId, dto);
  }

  @Patch('vehicles/:vehicleId/documents/:documentId')
  @ApiOperation({
    summary: 'Replace a rejected motorcycle registration document',
    description:
      'Validates rider ownership, replaces the rejected evidence, clears its review fields, and returns it to PENDING.',
  })
  @ApiParam({ name: 'vehicleId', example: 20 })
  @ApiParam({ name: 'documentId', example: 22 })
  @StandardErrors()
  replaceVehicleDocument(
    @CurrentUser('id') userId: number,
    @Param('vehicleId', ParseIntPipe) vehicleId: number,
    @Param('documentId', ParseIntPipe) documentId: number,
    @Body() dto: ReplaceVehicleDocumentDto,
  ) {
    return this.ridersService.replaceVehicleDocument(userId, vehicleId, documentId, dto);
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

  @Post('guarantors/:guarantorId/documents')
  @ApiOperation({
    summary: 'Attach a guarantor ID only when compliance requests a guarantor',
  })
  @ApiParam({ name: 'guarantorId', example: 40 })
  @OkExample({ id: 41, type: 'NIN', status: 'PENDING' })
  @StandardErrors()
  addGuarantorDocument(
    @CurrentUser('id') userId: number,
    @Param('guarantorId', ParseIntPipe) guarantorId: number,
    @Body() dto: CreateGuarantorDocumentDto,
  ) {
    return this.ridersService.addGuarantorDocument(userId, guarantorId, dto);
  }

  @Post('submit')
  @ApiOperation({
    summary: 'Submit or resubmit the rider application for compliance review',
    description:
      'Requires service area, emergency contact, identity or driver licence, a started liveness-only session, an automatic licence request, motorcycle photo/plate, and registration upload. Rejected riders can correct evidence and resubmit; the previous rejection snapshot is cleared and submissionAttempt increments. UNDER_REVIEW, APPROVED, and SUSPENDED profiles cannot resubmit. A bank account is required only before withdrawal.',
  })
  @OkExample({
    id: 50,
    onboardingStatus: 'UNDER_REVIEW',
    submissionAttempt: 2,
    statusMessage: 'Your Account is Under Review',
    canSubmit: false,
    canAcceptDeliveries: false,
  })
  @StandardErrors()
  submitForReview(@CurrentUser('id') userId: number) {
    return this.ridersService.submitForReview(userId);
  }

  @Post('kyc/session')
  @ApiOperation({
    summary: 'Mint an Identro liveness-only SDK session',
    description:
      'Always uses FACE_LIVENESS_ONLY. There is no separate face-match request and provider credentials never reach the client.',
  })
  @OkExample({
    sdkSessionToken: '<session token returned to mobile SDK>',
    expiresAt: '2026-10-01T12:30:00.000Z',
  })
  @StandardErrors()
  mintKycSession(@CurrentUser('id') userId: number, @Body() dto: MintKycSessionDto) {
    return this.ridersService.mintKycSession(userId, dto);
  }

  @Post('kyc/verify-document')
  @ApiOperation({
    summary: 'Trigger automated Identro identity verification for a rider document',
    description:
      'Calls the appropriate identity endpoint. Biometric verification is handled separately by the liveness-only flow; selfie images are not accepted here.',
  })
  @OkExample({
    id: 10,
    type: 'NIN',
    status: 'APPROVED',
    qoreidStatus: 'VERIFIED',
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
  @ApiQuery({ name: 'limit', required: false, example: 15 })
  @OkExample({ items: [], total: 0, page: 1, limit: 15 })
  @StandardErrors()
  getTransactions(
    @CurrentUser('id') userId: number,
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 15,
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
