import type { LatLon } from '../osm/area';

export interface Place extends LatLon {
  name: string;
  /** The rest of the address, for telling similar names apart. */
  detail: string;
}

export class GeocodeError extends Error {
  constructor(status: number) {
    super(`Address search failed (HTTP ${status})`);
    this.name = 'GeocodeError';
  }
}

interface NominatimPlace {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

interface Options {
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const BASE = 'https://nominatim.openstreetmap.org';
/** Nominatim's usage policy allows at most one request per second. */
const MIN_INTERVAL_MS = 1_000;
const round = (degrees: number) => String(Number(degrees.toFixed(4)));

function toPlace(result: NominatimPlace): Place {
  const parts = result.display_name.split(', ');
  const name = result.name || parts[0]!;
  const detail = parts[0] === name ? parts.slice(1).join(', ') : parts.join(', ');
  return { name, detail, lat: Number(result.lat), lon: Number(result.lon) };
}

/**
 * Address search and reverse lookup with OpenStreetMap's Nominatim. The policy forbids
 * search-as-you-type, so callers should search only when the user submits.
 */
export function createNominatim({
  fetch = globalThis.fetch,
  now = Date.now,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}: Options = {}) {
  let lastRequest = -Infinity;

  async function get<T>(path: string, params: Record<string, string>, signal?: AbortSignal) {
    const wait = lastRequest + MIN_INTERVAL_MS - now();
    if (wait > 0) await sleep(wait);
    lastRequest = now();
    const url = `${BASE}${path}?${new URLSearchParams({ format: 'jsonv2', ...params })}`;
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new GeocodeError(response.status);
    return (await response.json()) as T;
  }

  return {
    async search(
      query: string,
      { near, signal }: { near?: LatLon; signal?: AbortSignal } = {},
    ): Promise<Place[]> {
      if (!query.trim()) return [];
      const params: Record<string, string> = { q: query.trim(), limit: '5' };
      if (near) {
        const box = [near.lon - 0.1, near.lat + 0.1, near.lon + 0.1, near.lat - 0.1];
        params.viewbox = box.map(round).join(',');
        params.bounded = '0';
      }
      return (await get<NominatimPlace[]>('/search', params, signal)).map(toPlace);
    },

    async reverse(point: LatLon, { signal }: { signal?: AbortSignal } = {}): Promise<Place | null> {
      const result = await get<NominatimPlace | { error: string }>(
        '/reverse',
        { lat: String(point.lat), lon: String(point.lon), zoom: '17' },
        signal,
      );
      return 'error' in result ? null : toPlace(result);
    },
  };
}

export type Geocoder = ReturnType<typeof createNominatim>;
