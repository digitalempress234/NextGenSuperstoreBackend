import { Controller, Get, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { LocationsService } from './locations.service';

@ApiTags('Locations')
@Controller('locations')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Public()
  @Get('states')
  @ApiOperation({ summary: 'List searchable Nigerian states' })
  @ApiQuery({ name: 'search', required: false, example: 'Lag' })
  states(@Query('search') search?: string) {
    return this.locations.listStates(search);
  }

  @Public()
  @Get('cities')
  @ApiOperation({ summary: 'List searchable cities for a selected Nigerian state' })
  @ApiQuery({ name: 'state', required: true, example: 'Lagos' })
  @ApiQuery({ name: 'search', required: false, example: 'Ike' })
  cities(@Query('state') state: string, @Query('search') search?: string) {
    return this.locations.listCities(state, search);
  }
}
