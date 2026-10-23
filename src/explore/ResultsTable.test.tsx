import { render, screen, within } from '@testing-library/react';
import type { AlgorithmId } from '../algorithms';
import type { Timeline } from '../playback/timeline';
import type { AlgorithmRun } from '../worker/job';
import { ResultsTable } from './ResultsTable';

// Greedy finishes first with a 20 % worse route; A* next with the best; Dijkstra last.
function run(algorithm: AlgorithmId, steps: number, cost: number): AlgorithmRun {
  const timeline = {
    steps,
    frontierPeakAt: Uint32Array.from({ length: steps + 1 }, (_, t) => 2 * t + 1),
    route: { cost, meters: cost * 7, positions: new Float64Array() },
  } as Timeline;
  return { algorithm, timeline, stats: { expanded: steps, pushed: 0, maxFrontier: 0 } };
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
