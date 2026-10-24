import { runJob } from '../worker/job';
import { boxAround } from './area';
import { SAMPLE_AREA, SAMPLE_ROUTE, sampleStreetsFor } from './sample';

describe('the sample route', () => {
  const { start, target } = SAMPLE_ROUTE;

  it('lies inside the bundled streets', async () => {
    const sample = await sampleStreetsFor(boxAround(start, target));
    expect(sample?.box).toEqual(SAMPLE_AREA);
    expect(sample?.network.lat.length).toBeGreaterThan(100);
  });

  it('leaves routes outside the bundled streets to a download', async () => {
    const obelisco = { lat: -34.6037, lon: -58.3816 };
    expect(await sampleStreetsFor(boxAround(start, obelisco))).toBeUndefined();
  });

  it('runs end to end on the bundled streets, by car, without downloading', async () => {
    const download = vi.fn();
    const result = await runJob(
      {
        start,
        target,
        mode: 'car',
        objective: 'fastest',
        algorithms: ['dijkstra', 'astar'],
        astarWeight: 1,
      },
      {
        loadRoadNetwork: async (_area, { ends }) => {
          const sample = ends && (await sampleStreetsFor(ends));
          if (!sample) return download();
          return { network: sample.network, fromCache: true, box: sample.box };
        },
        onProgress: () => {},
      },
    );
    expect(download).not.toHaveBeenCalled();
    const [dijkstra, astar] = result.runs;
    expect(dijkstra!.timeline.route).not.toBeNull();
    expect(astar!.timeline.route!.cost).toBeCloseTo(dijkstra!.timeline.route!.cost, 6);
  });
});
