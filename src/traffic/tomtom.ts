import { VectorTile } from '@mapbox/vector-tile';
import { PbfReader } from 'pbf';
import type { BBox } from '../osm/area';
import { tilesCovering, type Tile } from './tiles';
import { TrafficError, type TrafficReading } from './types';

/**
 * TomTom's flow tiles at this zoom are about 2 km across and carry local streets as well as main
 * roads. A city-sized area needs a few dozen of them, a small share of a free key's daily tiles.
 */
export const TOMTOM_ZOOM = 14;
const LAYER = 'Traffic flow';
const PARALLEL = 6;

/** The Orbis flow tile for `tile`, with the key in the query so browsers skip the preflight. */
export function tomTomTileUrl({ z, x, y }: Tile, key: string): string {
  const url = new URL(`https://api.tomtom.com/maps/orbis/traffic/flow/vector/tile/${z}/${x}/${y}`);
  url.searchParams.set('apiVersion', '2');
  url.searchParams.set('key', key);
  return url.toString();
}

/**
 * The readings in one flow tile. Only TomTom's default tags are used: `relative_speed`, the
 * current speed as a share of free flow, and `road_closure`. Each direction of a two-way road is
 * its own line, drawn the way the traffic goes.
 */
export function readTomTomTile(bytes: Uint8Array, { z, x, y }: Tile): TrafficReading[] {
  const layer = new VectorTile(new PbfReader(bytes)).layers[LAYER];
  if (!layer) return [];
  const readings: TrafficReading[] = [];
  for (let i = 0; i < layer.length; i++) {
    const feature = layer.feature(i);
    const ratio = feature.properties.relative_speed;
    if (typeof ratio !== 'number') continue;
    const closed = feature.properties.road_closure === true;
    const { geometry } = feature.toGeoJSON(x, y, z);
    const lines =
      geometry.type === 'LineString'
        ? [geometry.coordinates]
        : geometry.type === 'MultiLineString'
          ? geometry.coordinates
          : [];
    for (const line of lines) {
      if (line.length < 2) continue;
      readings.push({
        line: line.map(([lon, lat]) => [lon!, lat!] as const),
        ratio: Math.min(1, Math.max(0, ratio)),
        closed,
      });
    }
  }
  return readings;
}

export interface FetchTrafficOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
  /** Called as pieces arrive: how many are done, out of how many. */
  onProgress?(done: number, total: number): void;
}

export interface FetchedTraffic {
  readings: TrafficReading[];
  /** Tiles that could not be downloaded; their roads keep their usual speeds. */
  missingTiles: number;
}

const isAbort = (error: unknown) => (error as { name?: unknown } | null)?.name === 'AbortError';

/** Every flow tile over the area, a few at a time, straight from the browser to TomTom. */
export async function fetchTomTom(
  box: BBox,
  key: string,
  { fetch = globalThis.fetch, signal, onProgress }: FetchTrafficOptions = {},
): Promise<FetchedTraffic> {
  const tiles = tilesCovering(box, TOMTOM_ZOOM);
  const readings: TrafficReading[] = [];
  let missingTiles = 0;
  let done = 0;
  let next = 0;

  const download = async (tile: Tile) => {
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(tomTomTileUrl(tile, key), { signal });
    } catch (error) {
      if (isAbort(error)) throw error;
      missingTiles++;
      return;
    }
    if (response.status === 401 || response.status === 403) {
      throw new TrafficError('tomtom', 'key', `TomTom refused the key (HTTP ${response.status})`);
    }
    if (response.status === 429) {
      throw new TrafficError('tomtom', 'quota', 'TomTom says the key has made too many requests');
    }
    if (!response.ok) {
      missingTiles++;
      return;
    }
    readings.push(...readTomTomTile(new Uint8Array(await response.arrayBuffer()), tile));
  };

  const worker = async () => {
    while (next < tiles.length) {
      await download(tiles[next++]!);
      onProgress?.(++done, tiles.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, tiles.length) }, worker));

  if (tiles.length > 0 && missingTiles === tiles.length) {
    throw new TrafficError('tomtom', 'unavailable', 'No traffic tile could be downloaded');
  }
  return { readings, missingTiles };
}
