import type { Graph } from './graph';
import { haversineMeters } from './geo';

/**
 * The node closest to a point, optionally restricted to nodes marked in `allowed`.
 * A linear scan: fast enough for city-sized graphs and run only once per search.
 */
export function nearestNode(
  graph: Graph,
  lat: number,
  lon: number,
  allowed?: Uint8Array,
): { node: number; meters: number } | null {
  let best: { node: number; meters: number } | null = null;
  for (let node = 0; node < graph.nodeCount; node++) {
    if (allowed && !allowed[node]) continue;
    const meters = haversineMeters(lat, lon, graph.lat[node]!, graph.lon[node]!);
    if (!best || meters < best.meters) best = { node, meters };
  }
  return best;
}
