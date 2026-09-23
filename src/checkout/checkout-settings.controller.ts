import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRoute } from '../auth/admin-route.decorator';
import { StaffJwtGuard, AuthenticatedStaff } from '../staff/staff-jwt.guard';
import { CheckoutSettingsService } from './checkout-settings.service';
import {
  CheckoutSettingsDto,
  PickupStationDto,
  UpdatePickupStationDto,
} from './checkout-settings.dto';

export function assertCheckoutStaff(staff: AuthenticatedStaff, roles: string[]) {
  if (!staff || !['SUPER_ADMIN', ...roles].includes(staff.role))
    throw new ForbiddenException('Staff role cannot perform this action.');
}
@ApiTags('Checkout')
@ApiCookieAuth('purse_access_token')
@Controller('pickup-stations')
export class PickupStationsController {
  constructor(private readonly settings: CheckoutSettingsService) {}
  @Get()
  @ApiOperation({ summary: 'List active pickup stations configured by operations staff' })
  list() {
    return this.settings.stations();
  }
}
@ApiTags('Checkout administration')
@ApiCookieAuth('purse_staff_token')
@AdminRoute()
@UseGuards(StaffJwtGuard)
@Controller('admin/checkout')
export class CheckoutSettingsController {
  constructor(private readonly settings: CheckoutSettingsService) {}
  @Get('settings')
  @ApiOperation({ summary: 'Read delivery fee and channel availability settings' })
  get(@Req() req: { staffUser: AuthenticatedStaff }) {
    assertCheckoutStaff(req.staffUser, ['OPERATIONS_ADMIN', 'FINANCE_ADMIN']);
    return this.settings.settings();
  }
  @Put('settings')
  @ApiOperation({ summary: 'Configure per-store delivery fee, delivery, and OPay availability' })
  update(@Req() req: { staffUser: AuthenticatedStaff }, @Body() dto: CheckoutSettingsDto) {
    assertCheckoutStaff(req.staffUser, ['OPERATIONS_ADMIN', 'FINANCE_ADMIN']);
    return this.settings.updateSettings(req.staffUser.id, dto);
  }
  @Get('pickup-stations')
  @ApiOperation({ summary: 'List pickup stations, including inactive stations' })
  stations(@Req() req: { staffUser: AuthenticatedStaff }) {
    assertCheckoutStaff(req.staffUser, ['OPERATIONS_ADMIN']);
    return this.settings.stations(true);
  }
  @Post('pickup-stations')
  @ApiOperation({ summary: 'Create a pickup station' })
  create(@Req() req: { staffUser: AuthenticatedStaff }, @Body() dto: PickupStationDto) {
    assertCheckoutStaff(req.staffUser, ['OPERATIONS_ADMIN']);
    return this.settings.createStation(req.staffUser.id, dto);
  }
  @Patch('pickup-stations/:id')
  @ApiOperation({ summary: 'Update or deactivate a pickup station' })
  patch(
    @Req() req: { staffUser: AuthenticatedStaff },
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePickupStationDto,
  ) {
    assertCheckoutStaff(req.staffUser, ['OPERATIONS_ADMIN']);
    return this.settings.updateStation(req.staffUser.id, id, dto);
  }
}
