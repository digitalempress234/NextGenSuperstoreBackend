import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/current-user.decorator';
import { UsersService } from './users.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

@ApiTags('Addresses')
@ApiCookieAuth('purse_access_token')
@Controller('addresses')
export class AddressesController {
  constructor(private readonly users: UsersService) {}
  @Get()
  @ApiOperation({ summary: 'List saved delivery addresses for the current customer' })
  list(@CurrentUser('id') userId: number) {
    return this.users.getAddresses(userId);
  }
  @Post()
  @ApiOperation({ summary: 'Create a saved delivery address' })
  create(@CurrentUser('id') userId: number, @Body() dto: CreateAddressDto) {
    return this.users.addAddress(userId, dto);
  }
  @Patch(':id')
  @ApiOperation({ summary: 'Update a saved delivery address or make it the default' })
  update(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.users.updateAddress(userId, id, dto);
  }
  @Delete(':id')
  @ApiOperation({ summary: 'Delete a saved delivery address' })
  remove(@CurrentUser('id') userId: number, @Param('id', ParseIntPipe) id: number) {
    return this.users.deleteAddress(userId, id);
  }
}
