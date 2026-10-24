import { render, screen, within } from '@testing-library/react';
import type { AlgorithmId } from '../algorithms';
import type { Timeline } from '../playback/timeline';
import type { AlgorithmRun, PreparationView } from '../worker/job';
import { ResultsTable } from './ResultsTable';

// Greedy finishes first with a 20 % worse route; A* next with the best; Dijkstra last.
function run(algorithm: AlgorithmId, steps: number, cost: number): AlgorithmRun {
  const timeline = {
    steps,
    frontierPeakAt: Uint32Array.from({ length: steps + 1 }, (_, t) => 2 * t + 1),
    route: { cost, meters: cost * 7, positions: new Float64Array() },
  } as Timeline;
  return {
    algorithm,
    weight: 1,
    timeline,
    stats: { expanded: steps, pushed: 0, maxFrontier: 0 },
    searchMs: 1,
  };
}
const runs = [
  run('greedy', 1_203, 1_230),
  run('dijkstra', 48_210, 1_025),
  run('astar', 9_874, 1_025),
];

const row = (name: string | RegExp) => within(screen.getByRole('row', { name }));

describe('ResultsTable', () => {
  it('fills in each search as it reaches B', () => {
    render(<ResultsTable runs={runs} objective="fastest" step={9_874} />);
    expect(screen.getByRole('columnheader', { name: 'Route time' })).toBeInTheDocument();

    const greedy = row(/Greedy best-first/);
    expect(greedy.getByText('Done · step 1,203')).toBeInTheDocument();
    expect(greedy.getByText('20:30')).toBeInTheDocument();
    expect(greedy.getByText('8.6 km')).toBeInTheDocument();
    expect(greedy.getByText('+20.0%')).toBeInTheDocument();
    expect(greedy.getByText('fewest')).toBeInTheDocument();
    expect(greedy.getByText('2,407')).toBeInTheDocument();

    const astar = row(/A\* search/);
    expect(astar.getByText('best')).toBeInTheDocument();

    const dijkstra = row(/Dijkstra/);
    expect(dijkstra.getByText('Searching…')).toBeInTheDocument();
    expect(dijkstra.getByText('9,874')).toBeInTheDocument();
    expect(dijkstra.getByText('so far')).toBeInTheDocument();
  });

  it('names the weight of a weighted A*', () => {
    const weighted = runs.map((r) => (r.algorithm === 'astar' ? { ...r, weight: 2 } : r));
    render(<ResultsTable runs={weighted} objective="fastest" step={0} />);
    expect(screen.getByRole('row', { name: /A\* search · 2×/ })).toBeInTheDocument();
  });

  it('weighs routes by distance when optimising for the shortest', () => {
    render(<ResultsTable runs={runs} objective="shortest" step={48_210} />);
    expect(screen.queryByRole('columnheader', { name: 'Route time' })).not.toBeInTheDocument();
    expect(row(/Dijkstra/).getByText('1.0 km')).toBeInTheDocument();
    expect(row(/Dijkstra/).getByText('best')).toBeInTheDocument();
  });

  it('fits a phone with fewer columns, marking maps that are hidden', () => {
    render(
      <ResultsTable
        runs={runs}
        objective="fastest"
        step={9_874}
        variant="compact"
        hidden={['dijkstra']}
      />,
    );
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual([
      'Results · all 3',
      'Route time',
      'Expanded',
    ]);
    expect(row(/Greedy/).getByText('+20%')).toBeInTheDocument();
    expect(row(/Dijkstra/).getByText('hidden')).toBeInTheDocument();
    expect(row(/Dijkstra/).getByText('Searching…')).toBeInTheDocument();
  });
});

describe('ResultsTable with algorithms that prepare', () => {
  const advanced = [
    { ...run('dijkstra', 6_994, 283), searchMs: 6 },
    { ...run('alt', 1_539, 283), searchMs: 3 },
    { ...run('ch', 71, 283), searchMs: 1 },
  ];
  const preparation = {
    landmarks: { ms: 34, reused: false, node: new Uint32Array(8) },
    hierarchy: { ms: 228, reused: false, shortcuts: 17_646 },
  } as unknown as PreparationView;

  it('adds how long each search took, and what preparing cost, once', () => {
    render(
      <ResultsTable runs={advanced} objective="fastest" step={6_994} preparation={preparation} />,
    );
    expect(row(/Dijkstra/).getByText('6 ms')).toBeInTheDocument();
    expect(row(/Dijkstra/).getByText('none')).toBeInTheDocument();
    expect(row(/ALT/).getByText('34 ms · 8 landmarks')).toBeInTheDocument();
    expect(row(/Contraction/).getByText('228 ms · 17,646 shortcuts')).toBeInTheDocument();
  });

  it('works out how many routes on these roads pay for preparing', () => {
    render(
      <ResultsTable runs={advanced} objective="fastest" step={6_994} preparation={preparation} />,
    );
    // 228 ms of preparing, saving 6 − 1 = 5 ms a route: 46 routes.
    expect(screen.getByText(/CH wins once these roads answer about/)).toHaveTextContent(
      'about 46 routes',
    );
  });

  it('says preparing was reused', () => {
    const reused = {
      ...preparation,
      hierarchy: { ...preparation.hierarchy!, reused: true },
    } as PreparationView;
    render(<ResultsTable runs={advanced} objective="fastest" step={0} preparation={reused} />);
    expect(row(/Contraction/).getByText('0 ms · reused')).toBeInTheDocument();
  });

  it('marks a search stopped at the step limit', () => {
    const stopped = {
      ...run('bellmanford', 400_000, 283),
      timeline: { ...run('bellmanford', 400_000, 283).timeline, route: null, stopped: true },
    } as AlgorithmRun;
    render(<ResultsTable runs={[stopped]} objective="fastest" step={400_000} />);
    const bf = row(/Bellman-Ford/);
    expect(bf.getByText('Stopped · too long')).toBeInTheDocument();
    expect(bf.getByText('400,000+')).toBeInTheDocument();
  });
});
