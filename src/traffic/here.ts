import { haversineMeters } from '../graph/geo';
import type { BBox } from '../osm/area';
import type { FetchedTraffic, FetchTrafficOptions } from './tomtom';
import { TrafficError, type TrafficReading } from './types';

interface HereFlow {
  speed?: number;
  freeFlow?: number;
  jamFactor?: number;
  traversability?: string;
}

/** The parts of a HERE Traffic API v7 flow response that are used here. */
export interface HereFlowResponse {
  results: {
    location: {
      length: number;
      shape: { links: { points: { lat: number; lng: number }[] }[] };
    };
    currentFlow: HereFlow & { subSegments?: (HereFlow & { length: number })[] };
  }[];
}

type Point = readonly [number, number];

export function hereFlowUrl({ south, west, north, east }: BBox, key: string): string {
  const url = new URL('https://data.traffic.hereapi.com/v7/flow');
  url.searchParams.set('in', `bbox:${west},${south},${east},${north}`);
  url.searchParams.set('locationReferencing', 'shape');
  url.searchParams.set('apiKey', key);
  return url.toString();
}

/** Current speed as a share of free flow, or undefined when HERE gives nothing to compare. */
function ratioOf({ speed, freeFlow }: HereFlow): number | undefined {
  if (speed === undefined || !freeFlow || freeFlow <= 0) return undefined;
  return Math.min(1, Math.max(0, speed / freeFlow));
}

// HERE marks closures with traversability, and with the top jam factor.
const isClosed = ({ traversability, jamFactor }: HereFlow) =>
  traversability === 'closed' || jamFactor === 10;

const metersBetween = (a: Point, b: Point) => haversineMeters(a[1], a[0], b[1], b[0]);

/** Cuts a line into consecutive pieces whose lengths are in the given proportions. */
function splitByLength(line: Point[], lengths: number[]): Point[][] {
  const total = lengths.reduce((sum, l) => sum + l, 0);
  const steps = line.slice(1).map((point, i) => metersBetween(line[i]!, point));
  const scale = steps.reduce((sum, m) => sum + m, 0) / total;

  const pieces: Point[][] = [];
  let current: Point[] = [line[0]!];
  let i = 0; // the step being walked
  let into = 0; // metres already walked along step i
  for (const [k, length] of lengths.entries()) {
    let left = length * scale;
    const last = k === lengths.length - 1;
    while (i < steps.length && (last || steps[i]! - into <= left)) {
      left -= steps[i]! - into;
      current.push(line[i + 1]!);
      i++;
      into = 0;
    }
    if (!last && i < steps.length) {
      into += left;
      const t = into / steps[i]!;
      const [a, b] = [line[i]!, line[i + 1]!];
      const cut = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] as const;
      current.push(cut);
      pieces.push(current);
      current = [cut];
    } else {
      pieces.push(current);
      current = [current.at(-1)!];
    }
  }
  return pieces;
}

/**
 * The readings in a flow response. HERE gives one item per direction of a road, its shape
 * drawn the way traffic flows, and sometimes splits it into sub-segments with their own speeds.
 */
export function readHereFlow(response: HereFlowResponse): TrafficReading[] {
  const readings: TrafficReading[] = [];
  for (const { location, currentFlow } of response.results) {
    const line: Point[] = [];
    for (const link of location.shape.links) {
      for (const { lat, lng } of link.points) {
        const previous = line.at(-1);
        if (!previous || previous[0] !== lng || previous[1] !== lat) line.push([lng, lat]);
      }
    }
    if (line.length < 2) continue;

    const parts = currentFlow.subSegments?.length ? currentFlow.subSegments : undefined;
    const pieces = parts
      ? splitByLength(
          line,
          parts.map((p) => p.length),
        )
      : [line];
    (parts ?? [currentFlow]).forEach((flow, k) => {
      const ratio = ratioOf(flow);
      const piece = pieces[k]!;
      if (ratio === undefined || piece.length < 2) return;
      readings.push({ line: piece, ratio, closed: isClosed(flow) });
    });
  }
  return readings;
}

const isAbort = (error: unknown) => (error as { name?: unknown } | null)?.name === 'AbortError';

/** The flow over the whole area in one request, straight from the browser to HERE. */
export async function fetchHere(
  box: BBox,
  key: string,
  { fetch = globalThis.fetch, signal, onProgress }: FetchTrafficOptions = {},
): Promise<FetchedTraffic> {
  let response: Response;
  try {
    response = await fetch(hereFlowUrl(box, key), { signal });
  } catch (error) {
    if (isAbort(error)) throw error;
    // HERE sends its 401s without CORS headers, so a refused key also ends up here.
    throw new TrafficError('here', 'unavailable', 'HERE did not answer');
  }
  if (response.status === 401 || response.status === 403) {
    throw new TrafficError('here', 'key', `HERE refused the key (HTTP ${response.status})`);
  }
  if (response.status === 429) {
    throw new TrafficError('here', 'quota', 'HERE says the key has made too many requests');
  }
  if (!response.ok) {
    throw new TrafficError('here', 'unavailable', `HERE answered HTTP ${response.status}`);
  }
  const readings = readHereFlow((await response.json()) as HereFlowResponse);
  onProgress?.(1, 1);
  return { readings, missingTiles: 0 };
}
