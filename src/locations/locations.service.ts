import { Injectable } from '@nestjs/common';
import { NIGERIAN_LOCATIONS } from './locations.data';

@Injectable()
export class LocationsService {
  listStates(search?: string) {
    const states = Object.keys(NIGERIAN_LOCATIONS);
    const query = search?.trim().toLowerCase();
    return (query ? states.filter((state) => state.toLowerCase().includes(query)) : states).sort(
      (a, b) => a.localeCompare(b),
    );
  }

  listCities(state: string, search?: string) {
    const cities = NIGERIAN_LOCATIONS[state];
    if (!cities) {
      return [];
    }

    const query = search?.trim().toLowerCase();
    return (query ? cities.filter((city) => city.toLowerCase().includes(query)) : cities).sort(
      (a, b) => a.localeCompare(b),
    );
  }
}
