import { tileBounds, tilesCovering } from './tiles';

describe('tilesCovering', () => {
  it('finds the single tile around a small box', () => {
    // Plaza de Mayo, Buenos Aires: at zoom 0 everything is in tile 0/0/0.
    const box = { south: -34.611, west: -58.376, north: -34.605, east: -58.368 };
    expect(tilesCovering(box, 0)).toEqual([{ z: 0, x: 0, y: 0 }]);
  });

  it('lists every tile the box touches, row by row', () => {
    const box = { south: -34.611, west: -58.376, north: -34.605, east: -58.368 };
    const tiles = tilesCovering(box, 14);
    expect(tiles.length).toBeGreaterThan(0);
    for (const { x, y } of tiles) {
      const bounds = tileBounds(14, x, y);
      const overlaps =
        bounds.west < box.east &&
        bounds.east > box.west &&
        bounds.south < box.north &&
        bounds.north > box.south;
      expect(overlaps).toBe(true);
    }
    // Together they cover the whole box.
    const xs = tiles.map((t) => t.x);
    const ys = tiles.map((t) => t.y);
    expect(tileBounds(14, Math.min(...xs), Math.min(...ys)).west).toBeLessThanOrEqual(box.west);
    expect(tileBounds(14, Math.min(...xs), Math.min(...ys)).north).toBeGreaterThanOrEqual(
      box.north,
    );
    expect(tileBounds(14, Math.max(...xs), Math.max(...ys)).east).toBeGreaterThanOrEqual(box.east);
    expect(tileBounds(14, Math.max(...xs), Math.max(...ys)).south).toBeLessThanOrEqual(box.south);
  });

  it('matches the usual slippy-map numbering', () => {
    // Tile 14/5535/9872 holds Plaza de Mayo, by the standard formula worked by hand.
    const point = { south: -34.6083, west: -58.3722, north: -34.6083, east: -58.3722 };
    expect(tilesCovering(point, 14)).toEqual([{ z: 14, x: 5535, y: 9872 }]);
  });
});
