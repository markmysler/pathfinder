import type { RoadNetwork } from '../osm/network';
import { allowedDirections } from '../osm/roads';
import type { TrafficReading } from './types';

/** Traffic on each road segment of a network, per direction. */
export interface SegmentTraffic {
  /**
   * Along each segment from its first node to its second: the current speed as a share of free
   * flow, 0 when the road is closed, NaN when no reading matched.
   */
  forward: Float32Array;
  /** The same, from the second node back to the first. */
  backward: Float32Array;
  /** How many segment directions got a reading. */
  matched: number;
}

export interface MatchOptions {
  /** How far a reading may be from a segment's middle, given that maps draw roads differently. */
  maxMeters?: number;
  /** How far a reading's direction may turn from a segment's before it counts as another road. */
  maxDegrees?: number;
}

/** Jammed traffic still moves; only a closure stops it. */
const SLOWEST = 0.05;
const CELL_METERS = 32;
const METERS_PER_DEGREE = 111_195;
// Very short segments (bends, kerbs) have unreliable directions, so they get more leeway.
const SHORT_METERS = 10;
const SHORT_EXTRA_DEGREES = 20;
/** How many metres of distance a full right-angle turn counts as, when choosing a reading. */
const TURN_METERS = 30;

/**
 * Links readings, drawn on the provider's own map, to the OSM road segments they describe. A
 * segment takes the reading nearest its middle that runs within a few metres of it and the same
 * way (or, for the backward direction, the opposite way). Positions are flattened to metres
 * around the network's centre, which is accurate enough over a city.
 */
export function matchTraffic(
  network: RoadNetwork,
  readings: readonly TrafficReading[],
  { maxMeters = 15, maxDegrees = 35 }: MatchOptions = {},
): SegmentTraffic {
  const { segmentCount } = network;
  const forward = new Float32Array(segmentCount).fill(NaN);
  const backward = new Float32Array(segmentCount).fill(NaN);

  let latSum = 0;
  for (let n = 0; n < network.nodeCount; n++) latSum += network.lat[n]!;
  const lat0 = network.nodeCount ? latSum / network.nodeCount : 0;
  const xScale = METERS_PER_DEGREE * Math.cos((lat0 * Math.PI) / 180);
  const toX = (lon: number) => lon * xScale;
  const toY = (lat: number) => lat * METERS_PER_DEGREE;

  // Every straight piece of every reading, in metres, filed under the grid cells it comes near.
  const pieces: { ax: number; ay: number; bx: number; by: number; reading: number }[] = [];
  const cells = new Map<string, number[]>();
  const cellOf = (v: number) => Math.floor(v / CELL_METERS);
  readings.forEach(({ line }, reading) => {
    for (let i = 0; i + 1 < line.length; i++) {
      const piece = {
        ax: toX(line[i]![0]),
        ay: toY(line[i]![1]),
        bx: toX(line[i + 1]![0]),
        by: toY(line[i + 1]![1]),
        reading,
      };
      const index = pieces.push(piece) - 1;
      for (
        let cx = cellOf(Math.min(piece.ax, piece.bx) - maxMeters);
        cx <= cellOf(Math.max(piece.ax, piece.bx) + maxMeters);
        cx++
      ) {
        for (
          let cy = cellOf(Math.min(piece.ay, piece.by) - maxMeters);
          cy <= cellOf(Math.max(piece.ay, piece.by) + maxMeters);
          cy++
        ) {
          const key = `${cx},${cy}`;
          const list = cells.get(key);
          if (list) list.push(index);
          else cells.set(key, [index]);
        }
      }
    }
  });

  const value = ({ ratio, closed }: TrafficReading) => (closed ? 0 : Math.max(SLOWEST, ratio));
  let matched = 0;
  for (let s = 0; s < segmentCount; s++) {
    const from = network.segmentFrom[s]!;
    const to = network.segmentTo[s]!;
    const ax = toX(network.lon[from]!);
    const ay = toY(network.lat[from]!);
    const dx = toX(network.lon[to]!) - ax;
    const dy = toY(network.lat[to]!) - ay;
    const length = Math.hypot(dx, dy);
    if (length === 0) continue;
    const mx = ax + dx / 2;
    const my = ay + dy / 2;
    const degrees = maxDegrees + (length < SHORT_METERS ? SHORT_EXTRA_DEGREES : 0);
    const minCos = Math.cos((degrees * Math.PI) / 180);

    let bestForward = { score: Infinity, reading: -1 };
    let bestBackward = { score: Infinity, reading: -1 };
    for (const index of cells.get(`${cellOf(mx)},${cellOf(my)}`) ?? []) {
      const piece = pieces[index]!;
      const px = piece.bx - piece.ax;
      const py = piece.by - piece.ay;
      const pieceLength = Math.hypot(px, py);
      if (pieceLength === 0) continue;
      const t = Math.min(
        1,
        Math.max(0, ((mx - piece.ax) * px + (my - piece.ay) * py) / pieceLength ** 2),
      );
      const meters = Math.hypot(piece.ax + t * px - mx, piece.ay + t * py - my);
      if (meters > maxMeters) continue;
      const cos = (dx * px + dy * py) / (length * pieceLength);
      // Near and parallel beats nearer but at an angle, which is usually a road joining this one.
      const score = meters + TURN_METERS * (1 - Math.abs(cos));
      if (cos >= minCos && score < bestForward.score)
        bestForward = { score, reading: piece.reading };
      if (-cos >= minCos && score < bestBackward.score)
        bestBackward = { score, reading: piece.reading };
    }
    if (bestForward.reading >= 0) {
      forward[s] = value(readings[bestForward.reading]!);
      matched++;
    }
    if (bestBackward.reading >= 0) {
      backward[s] = value(readings[bestBackward.reading]!);
      matched++;
    }
  }
  return { forward, backward, matched };
}

/** Below this share of free flow, a road counts as slowed by traffic. */
export const SLOWED_BELOW = 0.75;

export interface TrafficCoverage {
  /** Directions of road a car may drive. */
  roads: number;
  /** Of those, how many got a reading. */
  matched: number;
  closed: number;
  slowed: number;
}

/** How much of the car network the traffic covers, and how much of it is slow or closed. */
export function trafficCoverage(network: RoadNetwork, traffic: SegmentTraffic): TrafficCoverage {
  const directions = network.wayTags.map((tags) => allowedDirections(tags, 'car'));
  const coverage = { roads: 0, matched: 0, closed: 0, slowed: 0 };
  const count = (share: number) => {
    coverage.roads++;
    if (Number.isNaN(share)) return;
    coverage.matched++;
    if (share === 0) coverage.closed++;
    else if (share < SLOWED_BELOW) coverage.slowed++;
  };
  for (let s = 0; s < network.segmentCount; s++) {
    const allowed = directions[network.segmentWay[s]!];
    if (allowed?.forward) count(traffic.forward[s]!);
    if (allowed?.backward) count(traffic.backward[s]!);
  }
  return coverage;
}
