import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiCookieAuth('purse_access_token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the authenticated user profile' })
  @OkExample({
    id: 1001,
    email: 'customer@example.com',
    firstName: 'Tony',
    lastName: 'Stark',
    status: 'ACTIVE',
    roles: ['CUSTOMER'],
  })
  @StandardErrors()
  getMe(@CurrentUser('id') userId: number) {
    return this.usersService.getProfile(userId);
  }

  @Get('me/access')
  @ApiOperation({
    summary: 'Get effective roles and permissions for the frontend access-control layer',
  })
  @OkExample({
    roles: ['CUSTOMER'],
    permissions: ['users.view', 'stores.view', 'products.view', 'orders.view'],
    merchantScopeIds: [],
    regionScopes: [],
  })
  @StandardErrors()
  access(@CurrentUser('id') userId: number) {
    return this.usersService.getAccess(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the authenticated user profile' })
  @OkExample({
    id: 1001,
    firstName: 'Updated',
    lastName: 'Customer',
    phoneNumber: '+2348012345678',
  })
  @StandardErrors()
  updateMe(@CurrentUser('id') userId: number, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('me/addresses')
  @ApiOperation({ summary: 'Get all saved addresses for the authenticated user' })
  @StandardErrors()
  getAddresses(@CurrentUser('id') userId: number) {
    return this.usersService.getAddresses(userId);
  }

  @Post('me/addresses')
  @ApiOperation({ summary: 'Add a new address for the authenticated user' })
  @StandardErrors()
  addAddress(@CurrentUser('id') userId: number, @Body() dto: CreateAddressDto) {
    return this.usersService.addAddress(userId, dto);
  }

  @Patch('me/addresses/:addressId')
  @ApiOperation({ summary: 'Update a saved address' })
  @StandardErrors()
  updateAddress(
    @CurrentUser('id') userId: number,
    @Param('addressId', ParseIntPipe) addressId: number,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(userId, addressId, dto);
  }

  @Delete('me/addresses/:addressId')
  @ApiOperation({ summary: 'Delete a saved address' })
  @StandardErrors()
  deleteAddress(
    @CurrentUser('id') userId: number,
    @Param('addressId', ParseIntPipe) addressId: number,
  ) {
    return this.usersService.deleteAddress(userId, addressId);
  }
}
