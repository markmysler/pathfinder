import type { BBox } from './area';
import type { Cache } from './cache';
import { buildRoadNetwork, type OverpassResponse, type RoadNetwork } from './network';
import { fetchOverpass, overpassQuery } from './overpass';
import type { SavedAreas, SavedPlace } from './saved';

/** Bump when the road network format or the rules that build it change. */
const CACHE_VERSION = 1;

type AttemptListener = (endpoint: string, index: number) => void;

export interface LoadOptions {
  fetchOverpass?: (
    query: string,
    options: { signal?: AbortSignal; onAttempt?: AttemptListener },
  ) => Promise<OverpassResponse>;
  cache?: Cache<RoadNetwork>;
  signal?: AbortSignal;
  /** Told about each Overpass server tried, when downloading. */
  onAttempt?: AttemptListener;
  /** Areas kept on the device, which stand in for streets that can't be downloaded. */
  saved?: SavedAreas;
  /** The route asking, recorded with the area it downloads. */
  route?: { start: SavedPlace; target: SavedPlace };
  /** Known to be offline: don't try to download. */
  offline?: boolean;
}

/** Offline, and the streets asked for are in no area saved on this device. */
export class NotSavedError extends Error {
  constructor() {
    super("You're offline, and these streets aren't saved on this device");
    this.name = 'NotSavedError';
  }
}

/** About how much room a network takes, stored. */
function sizeOf(network: RoadNetwork) {
  const arrays = [
    network.osmId,
    network.lat,
    network.lon,
    network.segmentFrom,
    network.segmentTo,
    network.segmentWay,
    network.segmentLength,
  ];
  return (
    arrays.reduce((sum, array) => sum + array.byteLength, 0) +
    JSON.stringify(network.wayTags).length
  );
}

/**
 * The road network for an area: from the cache when possible, otherwise from Overpass. When it
 * can't be downloaded (offline, or Overpass is down), a saved area around it stands in.
 */
export async function loadRoadNetwork(
  box: BBox,
  {
    fetchOverpass: download = fetchOverpass,
    cache,
    signal,
    onAttempt,
    saved,
    route,
    offline = false,
  }: LoadOptions = {},
): Promise<{ network: RoadNetwork; fromCache: boolean }> {
  const query = overpassQuery(box);
  const key = `roads-v${CACHE_VERSION}:${query}`;
  const cached = await cache?.get(key).catch(() => undefined);
  if (cached) {
    await saved?.touch(key).catch(() => undefined);
    return { network: cached, fromCache: true };
  }

  let network: RoadNetwork;
  try {
    if (offline) throw new NotSavedError();
    network = buildRoadNetwork(await download(query, { signal, onAttempt }));
  } catch (error) {
    if (signal?.aborted) throw error;
    const around = await saved?.containing(box).catch(() => undefined);
    const standIn = around && (await cache?.get(around.key).catch(() => undefined));
    if (around && standIn) {
      await saved!.touch(around.key).catch(() => undefined);
      return { network: standIn, fromCache: true };
    }
    throw error;
  }
  await cache?.set(key, network).catch(() => undefined);
  if (route) {
    const area = { key, box, savedAt: Date.now(), bytes: sizeOf(network), ...route };
    await saved?.save(area).catch(() => undefined);
  }
  return { network, fromCache: false };
}
