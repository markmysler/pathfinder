import type { BBox } from './area';
import type { OverpassResponse } from './network';
import { ROAD_TYPES } from './roads';

export { ROAD_TYPES };

/**
 * Public Overpass instances, tried in order. Each is a shared, volunteer-run service with its
 * own fair-use limits, and any of them can be slow or down at a given moment.
 */
export const DEFAULT_ENDPOINTS: readonly string[] = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

/** Overpass is asked to stop after this long; the client waits a little longer for the reply. */
const SERVER_TIMEOUT_S = 60;
const ATTEMPT_TIMEOUT_MS = 70_000;

/** All road ways in the box with their tags, followed by their nodes with coordinates only. */
export function overpassQuery({ south, west, north, east }: BBox): string {
  return [
    `[out:json][timeout:${SERVER_TIMEOUT_S}];`,
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
  /** How long to wait for one server before moving on to the next. */
  attemptTimeoutMs?: number;
  /** Called as each server is tried, e.g. to tell the user. */
  onAttempt?(endpoint: string, index: number): void;
}

// Checked by name: abort errors can come from another realm (a worker, a test environment).
const isAbort = (error: unknown) => (error as { name?: unknown } | null)?.name === 'AbortError';

const isOverpassResponse = (body: unknown): body is OverpassResponse & { remark?: unknown } =>
  typeof body === 'object' && body !== null && Array.isArray((body as OverpassResponse).elements);

type Outcome = { body: OverpassResponse } | { retry: string } | { fatal: string };

async function askOnce(
  fetch: typeof globalThis.fetch,
  endpoint: string,
  query: string,
  signal: AbortSignal,
): Promise<Outcome> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (response.status === 400) {
    return { fatal: `HTTP 400 ${(await response.text()).slice(0, 200)}` };
  }
  if (!response.ok) return { retry: `HTTP ${response.status}` };

  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (signal.aborted) throw error;
    return { retry: 'the response was not JSON' };
  }
  if (!isOverpassResponse(body)) return { retry: 'the response had no elements' };
  // Overpass reports timeouts and memory limits as a remark on an otherwise normal response.
  if (typeof body.remark === 'string' && body.remark.includes('runtime error')) {
    return { retry: body.remark };
  }
  return { body };
}

/**
 * Runs a query against the first Overpass endpoint that answers properly in time. Busy, failing,
 * slow or timed-out servers fall through to the next; a rejected query or a cancellation does not.
 */
export async function fetchOverpass(
  query: string,
  {
    fetch = globalThis.fetch,
    endpoints = DEFAULT_ENDPOINTS,
    signal,
    attemptTimeoutMs = ATTEMPT_TIMEOUT_MS,
    onAttempt,
  }: OverpassOptions = {},
): Promise<OverpassResponse> {
  const attempts: Attempt[] = [];
  for (const [index, endpoint] of endpoints.entries()) {
    signal?.throwIfAborted();
    onAttempt?.(endpoint, index);

    const attempt = new AbortController();
    const cancel = () => attempt.abort(signal?.reason);
    signal?.addEventListener('abort', cancel);
    const timer = setTimeout(
      () => attempt.abort(new DOMException('Timed out', 'TimeoutError')),
      attemptTimeoutMs,
    );
    try {
      const outcome = await askOnce(fetch, endpoint, query, attempt.signal);
      if ('body' in outcome) return outcome.body;
      attempts.push({ endpoint, reason: 'retry' in outcome ? outcome.retry : outcome.fatal });
      if ('fatal' in outcome) throw new OverpassError(attempts);
    } catch (error) {
      if (error instanceof OverpassError) throw error;
      if (signal?.aborted) throw signal.reason ?? error;
      if (attempt.signal.aborted) {
        attempts.push({
          endpoint,
          reason: `no answer within ${Math.round(attemptTimeoutMs / 1000)} s`,
        });
        continue;
      }
      if (isAbort(error)) throw error;
      attempts.push({ endpoint, reason: error instanceof Error ? error.message : String(error) });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
    }
  }
  throw new OverpassError(attempts);
}
