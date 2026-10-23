import type { Layer } from '@deck.gl/core';
import { PathStyleExtension } from '@deck.gl/extensions';
import { PathLayer } from '@deck.gl/layers';
import { JAMMED_BELOW } from '../traffic/match';
import type { TrafficOutcome } from '../worker/job';

export type LiveTraffic = Extract<TrafficOutcome, { status: 'live' }>;
type Live = LiveTraffic;
type Road = { path: [number, number][]; share: number };

const TRAFFIC: [number, number, number] = [255, 107, 107];
const dashed = new PathStyleExtension({ dash: true });

const roadsCache = new WeakMap<Live, { bands: Road[]; closed: Road[] }>();

function roadsOf(live: Live) {
  let roads = roadsCache.get(live);
  if (roads) return roads;
  const { positions, share } = live.slowRoads;
  const all = Array.from(share, (s, i): Road => ({
    path: [
      [positions[4 * i]!, positions[4 * i + 1]!],
      [positions[4 * i + 2]!, positions[4 * i + 3]!],
    ],
    share: s,
  }));
  roads = { bands: all.filter((r) => r.share > 0), closed: all.filter((r) => r.share === 0) };
  roadsCache.set(live, roads);
  return roads;
}

/**
 * Live traffic on the map, drawn under the search: soft bands on slow and jammed roads, dashes
 * on closed ones, and once the search is done, the best route on clear roads as a dotted line.
 */
export function trafficLayers(
  live: Live,
  { bands, finished }: { bands: boolean; finished: boolean },
): Layer[] {
  const layers: Layer[] = [];
  if (bands) {
    const { bands: slow, closed } = roadsOf(live);
    layers.push(
      new PathLayer<Road>({
        id: 'traffic-bands',
        data: slow,
        getPath: (d) => d.path,
        getColor: (d) => [...TRAFFIC, d.share < JAMMED_BELOW ? 179 : 82],
        getWidth: 12,
        widthUnits: 'pixels',
        capRounded: true,
      }),
      new PathLayer<Road>({
        id: 'traffic-closed',
        data: closed,
        getPath: (d: Road) => d.path,
        getColor: [...TRAFFIC, 235],
        getWidth: 4,
        widthUnits: 'pixels',
        getDashArray: [2, 1.4],
        extensions: [dashed],
      } as never),
    );
  }
  const story = live.story;
  if (finished && story?.changed) {
    const { positions } = story.clear;
    const path = Array.from({ length: positions.length / 2 }, (_, i): [number, number] => [
      positions[2 * i]!,
      positions[2 * i + 1]!,
    ]);
    layers.push(
      new PathLayer<{ path: [number, number][] }>({
        id: 'clear-route',
        data: [{ path }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [232, 236, 241, 200],
        getWidth: 3,
        widthUnits: 'pixels',
        capRounded: true,
        jointRounded: true,
        getDashArray: [0.7, 2.4],
        dashJustified: true,
        extensions: [dashed],
      } as never),
    );
  }
  return layers;
}
