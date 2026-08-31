import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { UpdateVendorProfileDto } from './dto/vendor.dto';
import { VendorsService } from './vendors.service';

@ApiTags('Vendors')
@ApiCookieAuth('purse_access_token')
@Controller('vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user vendor profile' })
  @OkExample({
    id: 1,
    userId: 1001,
    phoneNumber: '+2348012345678',
    state: 'Lagos',
    city: 'Ikeja',
    address: '12 Allen Avenue',
    documentReviewStatus: 'PENDING',
  })
  @StandardErrors()
  getMe(@CurrentUser('id') userId: number) {
    return this.vendorsService.getProfile(userId);
  }

  @Post('profile')
  @ApiOperation({ summary: 'Create or update vendor onboarding details' })
  @OkExample({
    id: 1,
    userId: 1001,
    phoneNumber: '+2348012345678',
    state: 'Lagos',
    documentReviewStatus: 'PENDING',
  })
  @StandardErrors()
  updateProfile(
    @CurrentUser('id') userId: number,
    @Body() dto: UpdateVendorProfileDto,
  ) {
    return this.vendorsService.updateProfile(userId, dto);
  }
}
