import type { Place } from '../geo/nominatim';
import type { BBox } from './area';

/**
 * The streets bundled with the app: the recorded Plaza de Mayo area (see fixtures/README.md). A
 * route whose A and B both lie inside it runs on them at once, with no download, online or
 * offline. `sample.ts` loads them; this module only describes them, so the page stays small.
 */
export const SAMPLE_AREA: BBox = { south: -34.611, west: -58.376, north: -34.605, east: -58.368 };

/** The route "Try a sample route" plans: across Plaza de Mayo, from the Cabildo to the Casa Rosada. */
export const SAMPLE_ROUTE: { start: Place; target: Place } = {
  start: { name: 'Cabildo', detail: 'Plaza de Mayo, Buenos Aires', lat: -34.6087, lon: -58.3738 },
  target: {
    name: 'Casa Rosada',
    detail: 'Plaza de Mayo, Buenos Aires',
    lat: -34.608,
    lon: -58.3703,
  },
};
