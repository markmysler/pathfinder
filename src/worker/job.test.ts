import plazaDeMayo from '../osm/fixtures/plaza-de-mayo.overpass.json';
import { RouteTooLongError } from '../osm/area';
import { buildRoadNetwork, type OverpassResponse } from '../osm/network';
import { NoRoadNearbyError } from '../osm/prepare';
import { TrafficError, type TrafficReading } from '../traffic/types';
import { runJob, transferablesOf, type JobRequest, type Stage } from './job';
import { preparationCache, type PrepareProgress } from './preparations';

const network = buildRoadNetwork(plazaDeMayo as unknown as OverpassResponse);
const request: JobRequest = {
  start: { lat: -34.608, lon: -58.3703 }, // Casa Rosada
  target: { lat: -34.6087, lon: -58.3738 }, // Cabildo
  mode: 'car',
  objective: 'fastest',
  algorithms: ['astar'],
};

function deps(overrides: Partial<Parameters<typeof runJob>[1]> = {}) {
  const stages: Stage[] = [];
  return {
    stages,
    deps: {
      loadRoadNetwork: async () => ({ network, fromCache: false }),
      onProgress: (stage: Stage) => stages.push(stage),
      ...overrides,
    },
  };
}

describe('runJob', () => {
  it('downloads the area, builds the graph, searches and returns a playable timeline', async () => {
    const { deps: d, stages } = deps();
    const result = await runJob(request, d);
    expect(stages).toEqual(['download', 'graph', 'search']);
    expect(result.runs).toHaveLength(1);
    const [run] = result.runs;
    expect(run!.algorithm).toBe('astar');
    expect(run!.timeline.steps).toBeGreaterThan(0);
    expect(run!.timeline.route).not.toBeNull();
    expect(run!.stats.expanded).toBe(run!.timeline.steps);
    expect(result.snapped.start.meters).toBeLessThan(100);
    expect(result.area.south).toBeLessThan(request.start.lat);
  });

  it('runs every chosen algorithm on the same download, in the order asked', async () => {
    const loadRoadNetwork = vi.fn(async () => ({ network, fromCache: false }));
    const result = await runJob(
      { ...request, algorithms: ['bfs', 'dijkstra', 'astar'] },
      deps({ loadRoadNetwork }).deps,
    );
    expect(loadRoadNetwork).toHaveBeenCalledTimes(1);
    expect(result.runs.map((run) => run.algorithm)).toEqual(['bfs', 'dijkstra', 'astar']);
    const [bfs, dijkstra, astar] = result.runs.map((run) => run.timeline);
    // Same start node for all, and the optimal algorithms agree on the cost.
    expect(bfs!.expandedNode[1]).toBe(astar!.expandedNode[1]);
    expect(astar!.route!.cost).toBeCloseTo(dijkstra!.route!.cost, 6);
    expect(bfs!.route!.cost).toBeGreaterThanOrEqual(dijkstra!.route!.cost - 1e-6);
  });

  it('runs A* with its estimate weighted, keeping the plain estimate for display', async () => {
    const result = await runJob(
      {
        ...request,
        objective: 'shortest',
        algorithms: ['dijkstra', 'astar', 'greedy'],
        astarWeight: 2,
      },
      deps().deps,
    );
    const [dijkstra, astar, greedy] = result.runs;
    expect(astar!.weight).toBe(2);
    expect(dijkstra!.weight).toBe(1);
    expect(greedy!.weight).toBe(1);
    // Weighted A* trades optimality for speed, but never by more than the weight.
    expect(astar!.timeline.route!.cost).toBeLessThanOrEqual(2 * dijkstra!.timeline.route!.cost);
    const plain = await runJob({ ...request, objective: 'shortest' }, deps().deps);
    const t = astar!.timeline;
    expect(t.expandedEstimate[1]).toBeCloseTo(plain.runs[0]!.timeline.expandedEstimate[1]!, 9);
  });

  it('runs the bidirectional searches to the same cost as their one-way versions', async () => {
    const result = await runJob(
      { ...request, algorithms: ['dijkstra', 'astar', 'bidijkstra', 'biastar', 'bibfs'] },
      deps().deps,
    );
    const [dijkstra, astar, bidijkstra, biastar, bibfs] = result.runs;
    expect(bidijkstra!.timeline.route!.cost).toBeCloseTo(dijkstra!.timeline.route!.cost, 6);
    expect(biastar!.timeline.route!.cost).toBeCloseTo(astar!.timeline.route!.cost, 6);
    for (const run of [bidijkstra, biastar, bibfs]) {
      expect(run!.timeline.bidirectional).toBe(true);
      expect(run!.timeline.meetCount).toBeGreaterThan(0);
      expect(run!.weight).toBe(1);
    }
    // Each side first expands its own start, estimating the same straight line from A to B.
    const t = biastar!.timeline;
    const firstBackward = t.expandedSide.indexOf(1);
    expect(t.expandedSide[1]).toBe(0);
    expect(firstBackward).toBeGreaterThan(1);
    expect(t.expandedEstimate[firstBackward]).toBeGreaterThan(0);
    expect(t.expandedEstimate[firstBackward]).toBeCloseTo(t.expandedEstimate[1]!, 9);
  });

  it('refuses a request without algorithms', async () => {
    await expect(runJob({ ...request, algorithms: [] }, deps().deps)).rejects.toThrow(
      /at least one algorithm/,
    );
  });

  it('names the nodes after their streets, for listing the frontier', async () => {
    const { places, runs } = await runJob(request, deps().deps);
    const node = runs[0]!.timeline.expandedNode[1]!;
    expect(places.nodeLabel.length).toBeGreaterThan(node);
    expect(places.labels).toContain('Avenida de Mayo & Bolívar');
    expect(transferablesOf(await runJob(request, deps().deps))).toHaveLength(
      Object.values(runs[0]!.timeline).filter(ArrayBuffer.isView).length + 2,
    );
  });

  it('reports where A and B were snapped to', async () => {
    const result = await runJob(request, deps().deps);
    const { start, target } = result.snapped;
    expect(result.runs[0]!.timeline.expandedNode[1]).toBe(start.node);
    expect(result.runs[0]!.timeline.expandedNode.at(-1)).toBe(target.node);
    expect(Math.abs(start.lat - request.start.lat)).toBeLessThan(0.001);
    expect(Math.abs(target.lon - request.target.lon)).toBeLessThan(0.001);
  });

  it('passes on whether the roads came from the cache', async () => {
    const { deps: d } = deps({ loadRoadNetwork: async () => ({ network, fromCache: true }) });
    expect((await runJob(request, d)).fromCache).toBe(true);
  });

  it('refuses trips that are too long before downloading anything', async () => {
    const loadRoadNetwork = vi.fn();
    const far = { ...request, target: { lat: -34.6, lon: -58.1 } };
    await expect(runJob(far, deps({ loadRoadNetwork }).deps)).rejects.toBeInstanceOf(
      RouteTooLongError,
    );
    expect(loadRoadNetwork).not.toHaveBeenCalled();
  });

  it('fails clearly when there are no roads for the mode', async () => {
    const empty = buildRoadNetwork({ elements: [] });
    const { deps: d } = deps({
      loadRoadNetwork: async () => ({ network: empty, fromCache: false }),
    });
    await expect(runJob(request, d)).rejects.toBeInstanceOf(NoRoadNearbyError);
  });

  it('stops before searching once cancelled', async () => {
    const controller = new AbortController();
    const { deps: d, stages } = deps({
      loadRoadNetwork: async () => {
        controller.abort();
        return { network, fromCache: false };
      },
      signal: controller.signal,
    });
    await expect(runJob(request, d)).rejects.toMatchObject({ name: 'AbortError' });
    expect(stages).not.toContain('search');
  });

  it('stops between searches once cancelled', async () => {
    const controller = new AbortController();
    const { deps: d } = deps({
      onProgress: (stage) => stage === 'search' && controller.abort(),
      signal: controller.signal,
    });
    await expect(
      runJob({ ...request, algorithms: ['bfs', 'dijkstra', 'astar'] }, d),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('lists every typed array of every timeline for zero-copy transfer', async () => {
    const result = await runJob({ ...request, algorithms: ['bfs', 'astar'] }, deps().deps);
    const buffers = transferablesOf(result);
    for (const { timeline } of result.runs) {
      expect(buffers).toContain(timeline.roadFrom.buffer);
      expect(buffers).toContain(timeline.route!.positions.buffer);
    }
    const typedArrays = result.runs.flatMap(({ timeline }) =>
      Object.values(timeline).filter(ArrayBuffer.isView),
    );
    // Plus each route's positions and the node labels.
    expect(buffers.length).toBe(typedArrays.length + 2 + 1);
    expect(buffers).toContain(result.places.nodeLabel.buffer);
  });

  it('says which server it is trying once the first one has failed', async () => {
    const progress: unknown[][] = [];
    await runJob(request, {
      loadRoadNetwork: async (_area, { onAttempt }) => {
        onAttempt?.('https://overpass-api.de/api/interpreter', 0);
        onAttempt?.('https://maps.mail.ru/osm/tools/overpass/api/interpreter', 1);
        return { network, fromCache: false };
      },
      onProgress: (...args) => progress.push(args),
    });
    expect(progress.slice(0, 2)).toEqual([
      ['download'],
      ['download', { host: 'maps.mail.ru', attempt: 2 }],
    ]);
  });
});

describe('runJob with live traffic', () => {
  const tomtom = { provider: 'tomtom' as const, key: 'k' };
  /** Every road drawn both ways at the same share of free flow, as a provider might report. */
  const everywhere = (ratio: number): TrafficReading[] =>
    Array.from({ length: network.segmentCount }, (_, s) => {
      const from = network.segmentFrom[s]!;
      const to = network.segmentTo[s]!;
      const a = [network.lon[from]!, network.lat[from]!] as const;
      const b = [network.lon[to]!, network.lat[to]!] as const;
      return [
        { line: [a, b], ratio, closed: false },
        { line: [b, a], ratio, closed: false },
      ];
    }).flat();
  const live = (ratio: number) =>
    vi.fn(async () => ({ readings: everywhere(ratio), missingTiles: 0, fetchedAt: 1234 }));

  it('asks for traffic while the roads download, then routes with it', async () => {
    const order: string[] = [];
    const fetchTraffic = vi.fn(async () => {
      order.push('traffic');
      return { readings: everywhere(0.5), missingTiles: 0, fetchedAt: 1234 };
    });
    const { deps: d, stages } = deps({
      fetchTraffic,
      loadRoadNetwork: async () => {
        order.push('roads');
        return { network, fromCache: false };
      },
    });
    const withTraffic = await runJob({ ...request, traffic: tomtom }, d);
    expect(order).toEqual(['traffic', 'roads']);
    expect(fetchTraffic).toHaveBeenCalledWith(tomtom, withTraffic.area, expect.anything());
    expect(stages).toEqual(['download', 'traffic', 'graph', 'search']);

    const usual = await runJob(request, deps().deps);
    const cost = (result: typeof usual) => result.runs[0]!.timeline.route!.cost;
    expect(cost(withTraffic)).toBeCloseTo(2 * cost(usual), 6);
    expect(withTraffic.traffic).toMatchObject({
      status: 'live',
      provider: 'tomtom',
      fetchedAt: 1234,
      missingTiles: 0,
    });
    if (withTraffic.traffic.status !== 'live') throw new Error('expected live traffic');
    expect(withTraffic.traffic.matched).toBe(withTraffic.traffic.roads);
    expect(withTraffic.traffic.slowed).toBe(withTraffic.traffic.roads);
  });

  it('sends what the map and inspector show about traffic', async () => {
    const result = await runJob(
      { ...request, algorithms: ['dijkstra', 'astar'], traffic: tomtom },
      deps({ fetchTraffic: live(0.5) }).deps,
    );
    if (result.traffic.status !== 'live') throw new Error('expected live traffic');
    const { slowRoads, story } = result.traffic;
    // Every car road is at half speed: all of them are drawn as slow.
    expect(slowRoads.share.length).toBeGreaterThan(100);
    expect(slowRoads.positions).toHaveLength(4 * slowRoads.share.length);
    // Half speed everywhere doubles every route without moving it.
    expect(story!.changed).toBe(false);
    expect(story!.clear.costNow).toBeCloseTo(2 * story!.clear.cost, 3);
    expect(story!.best).toBeCloseTo(result.runs[0]!.timeline.route!.cost, 6);
    // Each frontier entry knows the traffic on the road it came along.
    const { timeline } = result.runs[1]!;
    expect(timeline.entryShare).toHaveLength(timeline.entryCount);
    expect(timeline.entryShare![1]).toBeCloseTo(0.5, 6);
    expect(timeline.entryMeters![1]).toBeGreaterThan(0);
    const buffers = transferablesOf(result);
    expect(buffers).toContain(timeline.entryShare!.buffer);
    expect(buffers).toContain(slowRoads.positions.buffer);
    expect(buffers).toContain(story!.clear.positions.buffer);
  });

  it('passes on how many traffic tiles have arrived', async () => {
    const progress: [number, number][] = [];
    await runJob(
      { ...request, traffic: tomtom },
      deps({
        fetchTraffic: async (_source, _area, { onProgress }) => {
          onProgress?.(1, 2);
          onProgress?.(2, 2);
          return { readings: everywhere(1), missingTiles: 0, fetchedAt: 0 };
        },
        onTrafficProgress: (done, total) => progress.push([done, total]),
      }).deps,
    );
    expect(progress).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it('falls back to usual speeds, and says why, when the provider refuses', async () => {
    const fetchTraffic = vi.fn(async () => {
      throw new TrafficError('tomtom', 'key', 'TomTom refused the key (HTTP 403)');
    });
    const result = await runJob({ ...request, traffic: tomtom }, deps({ fetchTraffic }).deps);
    expect(result.traffic).toEqual({ status: 'failed', provider: 'tomtom', reason: 'key' });
    const usual = await runJob(request, deps().deps);
    expect(result.runs[0]!.timeline.route!.cost).toBeCloseTo(
      usual.runs[0]!.timeline.route!.cost,
      9,
    );
  });

  it('treats an unexpected traffic error as the provider being unavailable', async () => {
    const fetchTraffic = vi.fn(async () => {
      throw new SyntaxError('Unexpected token');
    });
    const result = await runJob(
      { ...request, traffic: { provider: 'here', key: 'k' } },
      deps({ fetchTraffic }).deps,
    );
    expect(result.traffic).toEqual({ status: 'failed', provider: 'here', reason: 'unavailable' });
  });

  it('does not spend requests on traffic for walking or cycling, or without a key', async () => {
    const fetchTraffic = live(0.5);
    for (const mode of ['walk', 'bike'] as const) {
      const result = await runJob(
        { ...request, mode, traffic: tomtom },
        deps({ fetchTraffic }).deps,
      );
      expect(result.traffic).toEqual({ status: 'off' });
    }
    expect((await runJob(request, deps({ fetchTraffic }).deps)).traffic).toEqual({ status: 'off' });
    expect(fetchTraffic).not.toHaveBeenCalled();
  });

  it('still lets closures shape the shortest route', async () => {
    const fetchTraffic = live(0.5);
    const result = await runJob(
      { ...request, objective: 'shortest', traffic: tomtom },
      deps({ fetchTraffic }).deps,
    );
    expect(fetchTraffic).toHaveBeenCalled();
    expect(result.traffic.status).toBe('live');
  });

  it('stops when cancelled while waiting for traffic', async () => {
    const controller = new AbortController();
    const fetchTraffic = vi.fn(async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    });
    await expect(
      runJob(
        { ...request, traffic: tomtom },
        deps({ fetchTraffic, signal: controller.signal }).deps,
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('runJob with the advanced algorithms', () => {
  const advanced: JobRequest = {
    ...request,
    algorithms: ['dijkstra', 'bellmanford', 'alt', 'ch'],
  };

  it('prepares before searching, and finds the same best route as Dijkstra', async () => {
    const { deps: d, stages } = deps();
    const result = await runJob(advanced, d);
    expect(stages).toEqual(['download', 'graph', 'prepare', 'search']);
    const [dijkstra, bf, alt, ch] = result.runs;
    for (const run of [bf, alt, ch]) {
      expect(run!.timeline.route!.cost).toBeCloseTo(dijkstra!.timeline.route!.cost, 6);
    }
    expect(bf!.timeline.exhaustive).toBe(true);
    expect(bf!.timeline.steps).toBeGreaterThan(dijkstra!.timeline.steps);
    expect(ch!.timeline.bidirectional).toBe(true);
    expect(ch!.timeline.steps).toBeLessThan(dijkstra!.timeline.steps);
    expect(alt!.timeline.steps).toBeLessThan(dijkstra!.timeline.steps);
    for (const run of result.runs) expect(run.searchMs).toBeGreaterThanOrEqual(0);
  });

  it('does not prepare for algorithms that need nothing', async () => {
    const { deps: d, stages } = deps();
    const result = await runJob({ ...request, algorithms: ['dijkstra', 'bellmanford'] }, d);
    expect(stages).not.toContain('prepare');
    expect(result.preparation).toEqual({});
  });

  it('sends the landmarks, and how ALT used them at every step', async () => {
    const result = await runJob({ ...request, algorithms: ['alt'] }, deps().deps);
    const { landmarks } = result.preparation;
    expect(landmarks!.node).toHaveLength(8);
    expect(landmarks!.reused).toBe(false);
    const [alt] = result.runs;
    expect(alt!.landmarkSteps!.best).toHaveLength(alt!.timeline.steps + 1);
    // The estimate the inspector shows is the landmarks', not the straight line.
    const step = 1;
    const count = landmarks!.node.length;
    const bounds = alt!.landmarkSteps!.bounds.subarray(step * count, (step + 1) * count);
    expect(alt!.timeline.expandedEstimate[step]).toBeCloseTo(Math.max(0, ...bounds), 6);
  });

  it('sends how the map was contracted, and what the climbs took', async () => {
    const result = await runJob({ ...request, algorithms: ['ch'] }, deps().deps);
    const { hierarchy } = result.preparation;
    expect(hierarchy!.replay.steps).toBeGreaterThan(100);
    expect(hierarchy!.shortcuts).toBe(hierarchy!.replay.shortcutCount);
    const [ch] = result.runs;
    expect(ch!.climb!.roads).toBe(ch!.timeline.route!.positions.length / 2 - 1);
    // For scale: what Dijkstra expands for the same route.
    const plain = await runJob({ ...request, algorithms: ['dijkstra'] }, deps().deps);
    expect(ch!.climb!.dijkstra).toBe(plain.runs[0]!.timeline.steps);
  });

  it('passes on how preparing is getting on', async () => {
    const progress: PrepareProgress[] = [];
    await runJob(advanced, deps({ onPrepare: (p) => progress.push(p) }).deps);
    expect(progress.map((p) => p.kind)).toContain('landmarks');
    expect(progress.at(-1)).toMatchObject({ kind: 'hierarchy' });
    expect(progress.at(-1)!.done).toBe(progress.at(-1)!.total);
  });

  it('reuses what it prepared for the next run on the same roads, and only those', async () => {
    const preparations = preparationCache();
    const first = await runJob(advanced, deps({ preparations }).deps);
    const again = await runJob(
      { ...advanced, algorithms: ['ch', 'alt'] },
      deps({ preparations }).deps,
    );
    expect(first.preparation.hierarchy!.reused).toBe(false);
    expect(again.preparation.hierarchy!.reused).toBe(true);
    expect(again.preparation.landmarks!.reused).toBe(true);
    expect(again.preparation.hierarchy!.ms).toBe(first.preparation.hierarchy!.ms);
    const shortest = await runJob(
      { ...advanced, objective: 'shortest' },
      deps({ preparations }).deps,
    );
    expect(shortest.preparation.hierarchy!.reused).toBe(false);
  });

  it('stops Bellman-Ford at the step limit, saying how many steps it would need', async () => {
    const result = await runJob(
      { ...request, algorithms: ['bellmanford'] },
      deps({ stepLimit: 50 }).deps,
    );
    const [bf] = result.runs;
    expect(bf!.timeline.steps).toBe(50);
    expect(bf!.timeline.stopped).toBe(true);
    expect(bf!.timeline.route).toBeNull();
    const full = await runJob({ ...request, algorithms: ['bellmanford', 'dijkstra'] }, deps().deps);
    expect(full.runs[0]!.limit).toBeUndefined();
    expect(bf!.limit).toEqual({
      steps: 50,
      needed: full.runs[0]!.timeline.steps,
      dijkstra: full.runs[1]!.timeline.steps,
    });
  });

  it('moves every preparation buffer to the page rather than copying it', async () => {
    const result = await runJob(advanced, deps().deps);
    const buffers = transferablesOf(result);
    const { landmarks, hierarchy } = result.preparation;
    expect(buffers).toContain(landmarks!.position.buffer);
    expect(buffers).toContain(hierarchy!.replay.shortcutPosition.buffer);
    expect(buffers).toContain(result.runs[2]!.landmarkSteps!.bounds.buffer);
    expect(new Set(buffers).size).toBe(buffers.length);
  });
});
