import type { Geocoder, Place } from '../geo/nominatim';

export const casaRosada: Place = {
  name: 'Casa Rosada',
  detail: 'Balcarce 50, Buenos Aires',
  lat: -34.608,
  lon: -58.3703,
};
export const cabildo: Place = {
  name: 'Cabildo de Buenos Aires',
  detail: 'Bolívar 65, Buenos Aires',
  lat: -34.6087,
  lon: -58.3738,
};

export function fakeGeocoder(places: Place[] = [casaRosada, cabildo]) {
  return {
    search: vi.fn<Geocoder['search']>(async (query) =>
      places.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    ),
    reverse: vi.fn<Geocoder['reverse']>(async () => null),
  } satisfies Geocoder;
}
