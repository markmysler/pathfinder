import type { BBox } from '../osm/area';

/** A web-map tile in the usual z/x/y numbering, with y counted down from the north. */
export interface Tile {
  z: number;
  x: number;
  y: number;
}

const tileX = (lon: number, n: number) => ((lon + 180) / 360) * n;
const tileY = (lat: number, n: number) => {
  const radians = (lat * Math.PI) / 180;
  return ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * n;
};
const lonAt = (x: number, n: number) => (x / n) * 360 - 180;
const latAt = (y: number, n: number) =>
  (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;

/** Every tile at zoom `z` that the box touches, row by row from the north-west. */
export function tilesCovering(box: BBox, z: number): Tile[] {
  const n = 2 ** z;
  const clamp = (value: number) => Math.min(n - 1, Math.max(0, Math.floor(value)));
  const tiles: Tile[] = [];
  for (let y = clamp(tileY(box.north, n)); y <= clamp(tileY(box.south, n)); y++) {
    for (let x = clamp(tileX(box.west, n)); x <= clamp(tileX(box.east, n)); x++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/** The area a tile covers. */
export function tileBounds(z: number, x: number, y: number): BBox {
  const n = 2 ** z;
  return { south: latAt(y + 1, n), west: lonAt(x, n), north: latAt(y, n), east: lonAt(x + 1, n) };
}
