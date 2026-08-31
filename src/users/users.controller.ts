import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CurrentUser } from '../common/current-user.decorator';
import { OkExample, StandardErrors } from '../common/api-docs';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiCookieAuth('purse_access_token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

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
  @ApiOperation({ summary: 'Get effective roles and permissions for the frontend access-control layer' })
  @OkExample({
    roles: ['CUSTOMER'],
    permissions: [
      'users.view',
      'stores.view',
      'products.view',
      'orders.view',
    ],
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
}
