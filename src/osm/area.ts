import { haversineMeters } from '../graph/geo';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Routes longer than this are beyond what a browser can download and animate comfortably. */
export const MAX_ROUTE_METERS = 30_000;
const MIN_MARGIN_METERS = 500;
const MARGIN_FRACTION = 0.25;
const GRID_DEGREES = 0.005;
// One degree of latitude on the sphere haversineMeters uses, plus 1% so rounding never bites.
const METERS_PER_DEGREE = 111_195 * 0.99;

export class RouteTooLongError extends Error {
  constructor(readonly meters: number) {
    super(
      `A and B are ${(meters / 1000).toFixed(1)} km apart; the limit is ${MAX_ROUTE_METERS / 1000} km`,
    );
    this.name = 'RouteTooLongError';
  }
}

const snapDown = (degrees: number) =>
  Number((Math.floor(degrees / GRID_DEGREES) * GRID_DEGREES).toFixed(3));
const snapUp = (degrees: number) =>
  Number((Math.ceil(degrees / GRID_DEGREES) * GRID_DEGREES).toFixed(3));

/**
 * The area to download road data for: a box around both points with a margin that grows with
 * their distance (detours often leave the straight corridor), snapped outwards to a coarse grid
 * so that searches between nearby points can reuse the same cached download.
 */
export function searchArea(a: LatLon, b: LatLon): BBox {
  const meters = haversineMeters(a.lat, a.lon, b.lat, b.lon);
  if (meters > MAX_ROUTE_METERS) throw new RouteTooLongError(meters);

  const margin = Math.max(MIN_MARGIN_METERS, MARGIN_FRACTION * meters);
  const latMargin = margin / METERS_PER_DEGREE;
  const south = Math.min(a.lat, b.lat) - latMargin;
  const north = Math.max(a.lat, b.lat) + latMargin;
  // Longitude degrees shrink towards the poles; use the edge furthest from the equator.
  const widestLat = Math.max(Math.abs(south), Math.abs(north));
  const lonMargin = margin / (METERS_PER_DEGREE * Math.cos((widestLat * Math.PI) / 180));

  return {
    south: snapDown(south),
    west: snapDown(Math.min(a.lon, b.lon) - lonMargin),
    north: snapUp(north),
    east: snapUp(Math.max(a.lon, b.lon) + lonMargin),
  };
}
