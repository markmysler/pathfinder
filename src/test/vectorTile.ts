import { PbfWriter } from 'pbf';

/** A line feature for a test tile: [lon, lat] points and its tags. */
export interface TileLine {
  line: readonly (readonly [number, number])[];
  tags: Record<string, string | number | boolean>;
}

const EXTENT = 4096;
const zigzag = (n: number) => (n << 1) ^ (n >> 31);

/**
 * Writes a Mapbox Vector Tile with one layer of line features, following the MVT 2.1 spec, so
 * tests can feed real tile bytes to the same decoder the app uses. Only what tests need: lines,
 * and string, double and boolean tags.
 */
export function encodeTile(
  layerName: string,
  { z, x, y }: { z: number; x: number; y: number },
  features: readonly TileLine[],
): Uint8Array {
  const n = 2 ** z;
  const toTile = ([lon, lat]: readonly [number, number]): [number, number] => {
    const worldX = ((lon + 180) / 360) * n;
    const radians = (lat * Math.PI) / 180;
    const worldY = ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2) * n;
    return [Math.round((worldX - x) * EXTENT), Math.round((worldY - y) * EXTENT)];
  };

  const keys: string[] = [];
  const values: (string | number | boolean)[] = [];
  const indexOf = <T>(list: T[], item: T) => {
    const found = list.indexOf(item);
    return found === -1 ? list.push(item) - 1 : found;
  };

  const encoded = features.map(({ line, tags }) => {
    const tagIndices = Object.entries(tags).flatMap(([key, value]) => [
      indexOf(keys, key),
      indexOf(values, value),
    ]);
    const geometry: number[] = [];
    let cursor: [number, number] = [0, 0];
    line.map(toTile).forEach((point, i) => {
      if (i === 0) geometry.push((1 << 3) | 1);
      if (i === 1) geometry.push(((line.length - 1) << 3) | 2);
      geometry.push(zigzag(point[0] - cursor[0]), zigzag(point[1] - cursor[1]));
      cursor = point;
    });
    return { tagIndices, geometry };
  });

  const pbf = new PbfWriter();
  pbf.writeMessage(
    3,
    (_: null, layer) => {
      layer.writeVarintField(15, 2);
      layer.writeStringField(1, layerName);
      for (const feature of encoded) {
        layer.writeMessage(
          2,
          (f: typeof feature, out) => {
            out.writePackedVarint(2, f.tagIndices);
            out.writeVarintField(3, 2); // LineString
            out.writePackedVarint(4, f.geometry);
          },
          feature,
        );
      }
      for (const key of keys) layer.writeStringField(3, key);
      for (const value of values) {
        layer.writeMessage(
          4,
          (v: typeof value, out) => {
            if (typeof v === 'string') out.writeStringField(1, v);
            else if (typeof v === 'boolean') out.writeBooleanField(7, v);
            else out.writeDoubleField(3, v);
          },
          value,
        );
      }
      layer.writeVarintField(5, EXTENT);
    },
    null,
  );
  return pbf.finish();
}
