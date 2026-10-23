import type { BBox } from '../osm/area';
import { fetchHere } from './here';
import { fetchTomTom, type FetchedTraffic, type FetchTrafficOptions } from './tomtom';
import type { TrafficProvider } from './types';

/** The user's choice of provider and their own key for it. */
export interface TrafficSource {
  provider: TrafficProvider;
  key: string;
}

type ProviderFetch = (
  box: BBox,
  key: string,
  options: FetchTrafficOptions,
) => Promise<FetchedTraffic>;

export interface TimedTraffic extends FetchedTraffic {
  /** When the provider was asked, in milliseconds since the epoch. */
  fetchedAt: number;
}

export interface RecentTraffic {
  get(key: string): TimedTraffic | undefined;
  set(key: string, traffic: TimedTraffic): void;
  now(): number;
}

/** Answers kept for a short while, so running again moments later costs no extra requests. */
export function recentTraffic({
  ttlMs,
  now = Date.now,
}: {
  ttlMs: number;
  now?: () => number;
}): RecentTraffic {
  const entries = new Map<string, TimedTraffic>();
  return {
    now,
    get(key) {
      const entry = entries.get(key);
      if (entry && now() - entry.fetchedAt < ttlMs) return entry;
      entries.delete(key);
      return undefined;
    },
    set(key, traffic) {
      entries.set(key, traffic);
    },
  };
}

export interface FetchOptions extends FetchTrafficOptions {
  providers?: Record<TrafficProvider, ProviderFetch>;
  cache?: RecentTraffic;
}

const PROVIDERS: Record<TrafficProvider, ProviderFetch> = { tomtom: fetchTomTom, here: fetchHere };

/** Live traffic over an area from the user's provider, asked directly from the browser. */
export async function fetchTraffic(
  { provider, key }: TrafficSource,
  box: BBox,
  { providers = PROVIDERS, cache, ...options }: FetchOptions = {},
): Promise<TimedTraffic> {
  const cacheKey = JSON.stringify([provider, key, box]);
  const cached = cache?.get(cacheKey);
  if (cached) return cached;
  const fetchedAt = cache?.now() ?? Date.now();
  const traffic = { ...(await providers[provider](box, key, options)), fetchedAt };
  cache?.set(cacheKey, traffic);
  return traffic;
}
