import fc from 'fast-check';
import plazaDeMayo from '../osm/fixtures/plaza-de-mayo.overpass.json';
import { buildRoadNetwork, type OverpassResponse, type RoadNetwork } from '../osm/network';
import { allowedDirections } from '../osm/roads';
import { matchTraffic, trafficCoverage } from './match';
import type { TrafficReading } from './types';

// A tiny network: one east–west street of 100 m and one north–south street crossing its middle.
const DEG_PER_M = 1 / 111_195;
function tinyNetwork(): RoadNetwork {
  return buildRoadNetwork({
    elements: [
      { type: 'node', id: 1, lat: 0, lon: 0 },
      { type: 'node', id: 2, lat: 0, lon: 100 * DEG_PER_M },
      { type: 'node', id: 3, lat: 50 * DEG_PER_M, lon: 200 * DEG_PER_M },
      { type: 'node', id: 4, lat: -50 * DEG_PER_M, lon: 200 * DEG_PER_M },
      { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential' } },
      { type: 'way', id: 11, nodes: [3, 4], tags: { highway: 'residential' } },
    ],
  });
}
const metres = (east: number, north: number) => [east * DEG_PER_M, north * DEG_PER_M] as const;
const reading = (line: (readonly [number, number])[], ratio = 0.5, closed = false) =>
  ({ line, ratio, closed }) satisfies TrafficReading;

describe('matchTraffic on a tiny network', () => {
  const network = tinyNetwork();

  it('gives a road the traffic drawn along it, in the direction it is drawn', () => {
    // Drawn eastward, 6 m to the side, as another map might draw it.
    const traffic = matchTraffic(network, [reading([metres(-10, 6), metres(110, 6)], 0.3)]);
    expect(traffic.forward[0]).toBeCloseTo(0.3, 6);
    expect(traffic.backward[0]).toBeNaN();
    expect(traffic.forward[1]).toBeNaN();
    expect(traffic.matched).toBe(1);
  });

  it('gives traffic drawn the other way to the opposite direction', () => {
    const traffic = matchTraffic(network, [reading([metres(110, -4), metres(-10, -4)], 0.8)]);
    expect(traffic.forward[0]).toBeNaN();
    expect(traffic.backward[0]).toBeCloseTo(0.8, 6);
  });

  it('ignores traffic on a road that crosses, or runs too far away', () => {
    const crossing = reading([metres(50, 40), metres(50, -40)]);
    const farAway = reading([metres(-10, 40), metres(110, 40)]);
    const traffic = matchTraffic(network, [crossing, farAway]);
    expect(traffic.matched).toBe(0);
  });

  it('takes the nearest of two readings', () => {
    const near = reading([metres(-10, 2), metres(110, 2)], 0.2);
    const further = reading([metres(-10, 12), metres(110, 12)], 0.9);
    expect(matchTraffic(network, [further, near]).forward[0]).toBeCloseTo(0.2, 6);
  });

  it('marks a closed road with 0, and keeps jammed roads above 0', () => {
    const closed = matchTraffic(network, [reading([metres(0, 0), metres(100, 0)], 0, true)]);
    expect(closed.forward[0]).toBe(0);
    const jammed = matchTraffic(network, [reading([metres(0, 0), metres(100, 0)], 0)]);
    expect(jammed.forward[0]).toBeGreaterThan(0);
  });

  it('matches whichever way a segment was drawn, for any small offset', () => {
    fc.assert(
      fc.property(
        fc.double({ min: -10, max: 10, noNaN: true }),
        fc.boolean(),
        (offset, eastward) => {
          const line = [metres(-10, offset), metres(110, offset)];
          const traffic = matchTraffic(network, [reading(eastward ? line : line.reverse())]);
          return eastward
            ? traffic.forward[0] === 0.5 && Number.isNaN(traffic.backward[0])
            : traffic.backward[0] === 0.5 && Number.isNaN(traffic.forward[0]);
        },
      ),
    );
  });
});

describe('matchTraffic on the recorded Plaza de Mayo streets', () => {
  const network = buildRoadNetwork(plazaDeMayo as unknown as OverpassResponse);

  /**
   * Traffic as another map would describe it: one reading per car direction of each way, drawn
   * 4 m to the right of the OSM line and through every fifth point only, so its pieces neither
   * line up with OSM's nodes nor sit exactly on them. Each way gets its own speed.
   */
  function vendorTraffic() {
    const byWay = new Map<number, number[]>();
    for (let s = 0; s < network.segmentCount; s++) {
      const way = network.segmentWay[s]!;
      byWay.set(way, [...(byWay.get(way) ?? []), s]);
    }
    const readings: TrafficReading[] = [];
    const ratioOfWay = (way: number) => 0.1 + ((way * 37) % 90) / 100;
    for (const [way, segments] of byWay) {
      const directions = allowedDirections(network.wayTags[way]!, 'car');
      if (!directions) continue;
      const nodes = [
        network.segmentFrom[segments[0]!]!,
        ...segments.map((s) => network.segmentTo[s]!),
      ];
      const points = nodes.map((n) => [network.lon[n]!, network.lat[n]!] as const);
      const shifted = (line: (readonly [number, number])[]) =>
        line.map(([lon, lat], i) => {
          const a = line[Math.max(0, i - 1)]!;
          const b = line[Math.min(line.length - 1, i + 1)]!;
          const dx = (b[0] - a[0]) * Math.cos((lat * Math.PI) / 180);
          const dy = b[1] - a[1];
          const len = Math.hypot(dx, dy) || 1;
          // 4 m to the right of the direction of travel.
          const right = [dy / len, -dx / len];
          return [
            lon + (right[0]! * 4 * DEG_PER_M) / Math.cos((lat * Math.PI) / 180),
            lat + right[1]! * 4 * DEG_PER_M,
          ] as const;
        });
      const thinned = (line: (readonly [number, number])[]) =>
        line.filter((_, i) => i % 5 === 0 || i === line.length - 1);
      const ratio = ratioOfWay(way);
      if (directions.forward) readings.push(reading(thinned(shifted(points)), ratio));
      if (directions.backward)
        readings.push(reading(thinned(shifted([...points].reverse())), ratio));
    }
    return { readings, ratioOfWay };
  }

  it('finds traffic for nearly every car road, each in the right direction and with its speed', () => {
    const { readings, ratioOfWay } = vendorTraffic();
    const traffic = matchTraffic(network, readings);
    let carDirections = 0;
    let right = 0;
    let wrongDirection = 0;
    for (let s = 0; s < network.segmentCount; s++) {
      const way = network.segmentWay[s]!;
      const directions = allowedDirections(network.wayTags[way]!, 'car');
      if (!directions) continue;
      for (const [allowed, value] of [
        [directions.forward, traffic.forward[s]!],
        [directions.backward, traffic.backward[s]!],
      ] as const) {
        if (allowed) {
          carDirections++;
          if (Math.abs(value - ratioOfWay(way)) < 1e-6) right++;
        } else if (!Number.isNaN(value) && Math.abs(value - ratioOfWay(way)) < 1e-6) {
          wrongDirection++;
        }
      }
    }
    expect(carDirections).toBeGreaterThan(400);
    expect(right / carDirections).toBeGreaterThan(0.98);
    expect(wrongDirection / carDirections).toBeLessThan(0.02);
  });
});

describe('trafficCoverage', () => {
  it('counts the car directions with a reading, closed or slowed', () => {
    const network = tinyNetwork();
    const traffic = {
      forward: Float32Array.from([0.3, 0]),
      backward: Float32Array.from([NaN, 0.9]),
      matched: 3,
    };
    expect(trafficCoverage(network, traffic)).toEqual({
      roads: 4,
      matched: 3,
      closed: 1,
      slowed: 1,
    });
  });

  it('leaves out directions cars may not use', () => {
    const network = buildRoadNetwork({
      elements: [
        { type: 'node', id: 1, lat: 0, lon: 0 },
        { type: 'node', id: 2, lat: 0, lon: 0.001 },
        { type: 'node', id: 3, lat: 0, lon: 0.002 },
        { type: 'way', id: 10, nodes: [1, 2], tags: { highway: 'residential', oneway: 'yes' } },
        { type: 'way', id: 11, nodes: [2, 3], tags: { highway: 'footway' } },
      ],
    });
    const traffic = {
      forward: Float32Array.from([0.5, 0.5]),
      backward: Float32Array.from([0.5, 0.5]),
      matched: 4,
    };
    expect(trafficCoverage(network, traffic)).toEqual({
      roads: 1,
      matched: 1,
      closed: 0,
      slowed: 1,
    });
  });
});
