import type { AlgorithmId } from '../algorithms';
import type { Timeline } from '../playback/timeline';
import { compareRuns, finishMarks, totalSteps } from './comparison';

// Just the fields the comparison reads. Peak frontier grows by one per step.
function run(algorithm: AlgorithmId, steps: number, cost: number | null) {
  const timeline = {
    steps,
    frontierPeakAt: Uint32Array.from({ length: steps + 1 }, (_, t) => t + 1),
    route: cost === null ? null : { cost, meters: cost * 10, positions: new Float64Array() },
  } as Timeline;
  return { algorithm, timeline };
}

const runs = [run('greedy', 10, 120), run('dijkstra', 40, 100), run('astar', 25, 100)];

describe('totalSteps', () => {
  it('lasts as long as the longest search, so every search gets to finish', () => {
    expect(totalSteps(runs)).toBe(40);
  });
});

describe('compareRuns', () => {
  it('shows searches still running with their progress so far', () => {
    const rows = compareRuns(runs, 5);
    expect(rows.map((row) => row.status)).toEqual(['searching', 'searching', 'searching']);
    expect(rows.map((row) => row.expanded)).toEqual([5, 5, 5]);
    expect(rows.map((row) => row.peakFrontier)).toEqual([6, 6, 6]);
    expect(rows.every((row) => row.route === null && !row.best && !row.fewest)).toBe(true);
  });

  it('fills in each search once it reaches B, and stops counting there', () => {
    const [greedy, dijkstra, astar] = compareRuns(runs, 30);
    expect(greedy).toMatchObject({ status: 'found', expanded: 10, peakFrontier: 11 });
    expect(greedy!.route).toEqual({ cost: 120, meters: 1200 });
    expect(astar).toMatchObject({ status: 'found', expanded: 25 });
    expect(dijkstra).toMatchObject({ status: 'searching', expanded: 30, route: null });
  });

  it('marks the cheapest route found so far, and how much worse the others are', () => {
    expect(compareRuns(runs, 10)[0]).toMatchObject({ best: true, overBest: 0 });
    const [greedy, , astar] = compareRuns(runs, 30);
    expect(astar).toMatchObject({ best: true, overBest: 0 });
    expect(greedy!.best).toBe(false);
    expect(greedy!.overBest).toBeCloseTo(0.2);
  });

  it('marks every search that ties for the cheapest route', () => {
    const rows = compareRuns(runs, 40);
    expect(rows.map((row) => row.best)).toEqual([false, true, true]);
  });

  it('marks the finished search that expanded the fewest nodes', () => {
    expect(compareRuns(runs, 5).some((row) => row.fewest)).toBe(false);
    expect(compareRuns(runs, 40).map((row) => row.fewest)).toEqual([true, false, false]);
  });

  it('reports a search that ran out of frontier without reaching B', () => {
    const [stuck] = compareRuns([run('dfs', 8, null), ...runs], 20);
    expect(stuck).toMatchObject({ status: 'no-route', expanded: 8, route: null });
    expect(stuck).toMatchObject({ best: false, fewest: false, overBest: null });
  });
});

describe('finishMarks', () => {
  it('marks where each search that ends early finishes on the shared timeline', () => {
    expect(finishMarks(runs)).toEqual([
      { algorithm: 'greedy', step: 10 },
      { algorithm: 'astar', step: 25 },
    ]);
  });
});
