import type { BBox } from './area';
import type { OverpassResponse } from './network';
import { ROAD_TYPES } from './roads';

export { ROAD_TYPES };

/** Public Overpass instances, tried in order. Each has its own fair-use limits. */
export const DEFAULT_ENDPOINTS: readonly string[] = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** All road ways in the box with their tags, followed by their nodes with coordinates only. */
export function overpassQuery({ south, west, north, east }: BBox): string {
  return [
    '[out:json][timeout:90];',
    `way["highway"~"^(${ROAD_TYPES.join('|')})$"](${south},${west},${north},${east});`,
    'out body qt;',
    '>;',
    'out skel qt;',
  ].join('\n');
}

export interface Attempt {
  endpoint: string;
  reason: string;
}

export class OverpassError extends Error {
  constructor(readonly attempts: Attempt[]) {
    super(
      `Could not download map data (${attempts.map((a) => `${a.endpoint}: ${a.reason}`).join('; ')})`,
    );
    this.name = 'OverpassError';
  }
}

export interface OverpassOptions {
  fetch?: typeof globalThis.fetch;
  endpoints?: readonly string[];
  signal?: AbortSignal;
}

// Checked by name: abort errors can come from another realm (a worker, a test environment).
const isAbort = (error: unknown) => (error as { name?: unknown } | null)?.name === 'AbortError';

const isOverpassResponse = (body: unknown): body is OverpassResponse & { remark?: unknown } =>
  typeof body === 'object' && body !== null && Array.isArray((body as OverpassResponse).elements);

/**
 * Runs a query against the first Overpass endpoint that answers properly. Busy, failing or
 * timed-out servers fall through to the next; a rejected query or a cancellation does not.
 */
export async function fetchOverpass(
  query: string,
  { fetch = globalThis.fetch, endpoints = DEFAULT_ENDPOINTS, signal }: OverpassOptions = {},
): Promise<OverpassResponse> {
  const attempts: Attempt[] = [];
  for (const endpoint of endpoints) {
    signal?.throwIfAborted();
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal,
      });
    } catch (error) {
      if (isAbort(error) || signal?.aborted) throw error;
      attempts.push({ endpoint, reason: error instanceof Error ? error.message : String(error) });
      continue;
    }

    if (response.status === 400) {
      attempts.push({ endpoint, reason: `HTTP 400 ${(await response.text()).slice(0, 200)}` });
      throw new OverpassError(attempts);
    }
    if (!response.ok) {
      attempts.push({ endpoint, reason: `HTTP ${response.status}` });
      continue;
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      attempts.push({ endpoint, reason: 'the response was not JSON' });
      continue;
    }
    if (!isOverpassResponse(body)) {
      attempts.push({ endpoint, reason: 'the response had no elements' });
      continue;
    }
    // Overpass reports timeouts and memory limits as a remark on an otherwise normal response.
    if (typeof body.remark === 'string' && body.remark.includes('runtime error')) {
      attempts.push({ endpoint, reason: body.remark });
      continue;
    }
    return body;
  }
  throw new OverpassError(attempts);
}
