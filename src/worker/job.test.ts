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
  algorithm: 'astar',
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
    expect(result.algorithm).toBe('astar');
    expect(result.timeline.steps).toBeGreaterThan(0);
    expect(result.timeline.route).not.toBeNull();
    expect(result.stats.expanded).toBe(result.timeline.steps);
    expect(result.snapped.start.meters).toBeLessThan(100);
    expect(result.area.south).toBeLessThan(request.start.lat);
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

  it('lists every typed array of the timeline for zero-copy transfer', async () => {
    const { timeline } = await runJob(request, deps().deps);
    const buffers = transferablesOf(timeline);
    expect(buffers).toContain(timeline.roadFrom.buffer);
    expect(buffers).toContain(timeline.route!.positions.buffer);
    const typedArrays = Object.values(timeline).filter(ArrayBuffer.isView);
    expect(buffers.length).toBe(typedArrays.length + 1);
  });
});
