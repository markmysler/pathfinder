import type { BBox } from '../osm/area';
import { fetchTraffic as fetchLive, type TimedTraffic, type TrafficSource } from './fetch';
import { TrafficError, type TrafficFailure, type TrafficProvider } from './types';

/**
 * The user's traffic keys and which provider is on. They live only in this browser's storage and
 * are only ever sent to the provider they belong to.
 */
export interface TrafficSettings {
  provider: TrafficProvider | null;
  keys: Partial<Record<TrafficProvider, string>>;
}

const STORAGE_KEY = 'pathfinder.traffic';
const PROVIDERS: readonly TrafficProvider[] = ['tomtom', 'here'];
const isProvider = (value: unknown): value is TrafficProvider =>
  PROVIDERS.includes(value as TrafficProvider);
const empty = (): TrafficSettings => ({ provider: null, keys: {} });

const defaultStorage = () => {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
};

export function loadTrafficSettings(
  storage: Storage | undefined = defaultStorage(),
): TrafficSettings {
  try {
    const stored = JSON.parse(storage?.getItem(STORAGE_KEY) ?? 'null') as {
      provider?: unknown;
      keys?: Record<string, unknown>;
    } | null;
    if (!stored || typeof stored !== 'object') return empty();
    const keys: TrafficSettings['keys'] = {};
    for (const provider of PROVIDERS) {
      const key = stored.keys?.[provider];
      if (typeof key === 'string' && key.trim()) keys[provider] = key.trim();
    }
    return { provider: isProvider(stored.provider) ? stored.provider : null, keys };
  } catch {
    return empty();
  }
}

export function saveTrafficSettings(
  settings: TrafficSettings,
  storage: Storage | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Private windows and blocked storage: the settings last until the page closes.
  }
}

/** The provider to ask for traffic, if one is on and has a key. */
export function activeSource({ provider, keys }: TrafficSettings): TrafficSource | undefined {
  const key = provider ? keys[provider] : undefined;
  return provider && key ? { provider, key } : undefined;
}

// About 300 m around Plaza de Mayo, Buenos Aires: one TomTom tile, a small HERE answer.
const PROBE: BBox = { south: -34.6095, west: -58.3735, north: -34.6065, east: -58.3705 };

export type KeyCheck = { ok: true } | { ok: false; reason: TrafficFailure };

/** Tries a key on a small area, so the user learns it works before running anything. */
export async function checkKey(
  source: TrafficSource,
  {
    fetchTraffic = fetchLive,
  }: { fetchTraffic?: (source: TrafficSource, area: BBox) => Promise<TimedTraffic> } = {},
): Promise<KeyCheck> {
  try {
    await fetchTraffic(source, PROBE);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof TrafficError ? error.reason : 'unavailable' };
  }
}

/** Everything the page needs for traffic settings, swappable in tests. */
export interface TrafficService {
  load(): TrafficSettings;
  save(settings: TrafficSettings): void;
  check(source: TrafficSource): Promise<KeyCheck>;
}

/** Settings kept in this browser's storage, and keys tried against the real providers. */
export function browserTraffic(): TrafficService {
  return {
    load: () => loadTrafficSettings(),
    save: (settings) => saveTrafficSettings(settings),
    check: (source) => checkKey(source),
  };
}
