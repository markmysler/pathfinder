import plazaDeMayo from '../osm/fixtures/plaza-de-mayo.overpass.json';
import { RouteTooLongError } from '../osm/area';
import { buildRoadNetwork, type OverpassResponse } from '../osm/network';
import { NoRoadNearbyError } from '../osm/prepare';
import { runJob, transferablesOf, type JobRequest, type Stage } from './job';

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

  it('refuses a request without algorithms', async () => {
    await expect(runJob({ ...request, algorithms: [] }, deps().deps)).rejects.toThrow(
      /at least one algorithm/,
    );
  });

  it('reports where A and B were snapped to', async () => {
    const result = await runJob(request, deps().deps);
    const { start, target } = result.snapped;
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
    expect(buffers.length).toBe(typedArrays.length + 2);
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
