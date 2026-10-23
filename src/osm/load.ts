import type { BBox } from './area';
import type { Cache } from './cache';
import { buildRoadNetwork, type OverpassResponse, type RoadNetwork } from './network';
import { fetchOverpass, overpassQuery } from './overpass';

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
}

/** The road network for an area, from the cache when possible, otherwise from Overpass. */
export async function loadRoadNetwork(
  box: BBox,
  { fetchOverpass: download = fetchOverpass, cache, signal, onAttempt }: LoadOptions = {},
): Promise<{ network: RoadNetwork; fromCache: boolean }> {
  const query = overpassQuery(box);
  const key = `roads-v${CACHE_VERSION}:${query}`;
  const cached = await cache?.get(key).catch(() => undefined);
  if (cached) return { network: cached, fromCache: true };

  const network = buildRoadNetwork(await download(query, { signal, onAttempt }));
  await cache?.set(key, network).catch(() => undefined);
  return { network, fromCache: false };
}
