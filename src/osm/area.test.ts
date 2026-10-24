import { haversineMeters } from '../graph/geo';
import {
  crossesDateLine,
  CrossesDateLineError,
  MAX_ROUTE_METERS,
  RouteTooLongError,
  searchArea,
} from './area';

const plaza = { lat: -34.6083, lon: -58.3712 };
const nearby = { lat: -34.6037, lon: -58.3816 }; // ≈ 1 km away

/** Shortest distance from a point to each edge of a bounding box, in meters. */
function marginsOf(point: { lat: number; lon: number }, box: ReturnType<typeof searchArea>) {
  return [
    haversineMeters(point.lat, point.lon, box.north, point.lon),
    haversineMeters(point.lat, point.lon, box.south, point.lon),
    haversineMeters(point.lat, point.lon, point.lat, box.east),
    haversineMeters(point.lat, point.lon, point.lat, box.west),
  ];
}

describe('searchArea', () => {
  it('keeps at least 500 m of road around both points', () => {
    const box = searchArea(plaza, nearby);
    for (const point of [plaza, nearby]) {
      for (const margin of marginsOf(point, box)) expect(margin).toBeGreaterThanOrEqual(500);
    }
  });

  it('grows the margin with the distance between the points', () => {
    const far = { lat: -34.6083, lon: -58.2617 }; // ≈ 10 km east
    const box = searchArea(plaza, far);
    for (const point of [plaza, far]) {
      for (const margin of marginsOf(point, box)) expect(margin).toBeGreaterThanOrEqual(2_500);
    }
  });

  it('snaps edges outwards to a 0.005° grid so nearby searches share a cache entry', () => {
    const box = searchArea(plaza, nearby);
    for (const edge of [box.south, box.west, box.north, box.east]) {
      expect(Math.abs(edge / 0.005 - Math.round(edge / 0.005))).toBeLessThan(1e-9);
    }
    expect(searchArea({ lat: -34.6082, lon: -58.3711 }, nearby)).toEqual(box);
  });

  it('does not depend on which point is the start', () => {
    expect(searchArea(nearby, plaza)).toEqual(searchArea(plaza, nearby));
  });

  it('accepts trips up to 15 km', () => {
    expect(MAX_ROUTE_METERS).toBe(15_000);
    const fourteenKm = { lat: plaza.lat, lon: plaza.lon + 0.152 };
    expect(() => searchArea(plaza, fourteenKm)).not.toThrow();
  });

  it('refuses longer trips, reporting the distance', () => {
    const sixteenKm = { lat: plaza.lat, lon: plaza.lon + 0.175 };
    expect(() => searchArea(plaza, sixteenKm)).toThrow(RouteTooLongError);
    try {
      searchArea(plaza, sixteenKm);
    } catch (error) {
      expect((error as RouteTooLongError).meters).toBeGreaterThan(MAX_ROUTE_METERS);
    }
  });
});

describe('the 180° meridian', () => {
  // Taveuni, Fiji: the meridian runs through the island.
  const west = { lat: -16.8, lon: 179.99 };
  const east = { lat: -16.8, lon: -179.99 };

  it('refuses a route across it instead of boxing the whole world', () => {
    expect(crossesDateLine(west, east)).toBe(true);
    expect(() => searchArea(west, east)).toThrow(CrossesDateLineError);
  });

  it('keeps a route beside it inside -180..180', () => {
    const near = { lat: -16.8, lon: 179.998 };
    const box = searchArea(west, near);
    expect(box.east).toBeLessThanOrEqual(180);
    expect(box.west).toBeGreaterThan(179.9);
  });
});
