import type { Place } from '../geo/nominatim';
import type { BBox } from './area';

/**
 * The streets bundled with the app: the recorded Plaza de Mayo area (see fixtures/README.md). The
 * sample route runs on them at once, with no download, online or offline. Other routes there still
 * download as usual, so they're saved for offline use like any other. `sample.ts` loads them; this
 * module only describes them, so the page stays small.
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

/**
 * Whether A and B are still the sample route's own places. Choosing the sample puts these exact
 * objects in the plan, and searching, clicking, dragging or swapping replaces them, so an edited
 * route downloads its streets like any other.
 */
export const isSampleRoute = (start: Place | null, target: Place | null) =>
  start === SAMPLE_ROUTE.start && target === SAMPLE_ROUTE.target;
