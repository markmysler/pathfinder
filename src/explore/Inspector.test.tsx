import { render, screen, within } from '@testing-library/react';
import { algorithms, type AlgorithmId } from '../algorithms';
import { straightLineHeuristic } from '../algorithms/heuristics';
import { runSearch, summarize } from '../algorithms/trace';
import { buildTimeline } from '../playback/timeline';
import { grid } from '../test/fixtures';
import type { JobResult } from '../worker/job';
import { Inspector, RunCard } from './Inspector';

const graph = grid(5);
function resultFor(algorithm: AlgorithmId): JobResult {
  const heuristic = straightLineHeuristic(graph, 24);
  const trace = runSearch(algorithms[algorithm].search, {
    graph,
    source: 0,
    target: 24,
    heuristic,
  });
  return {
    algorithm,
    mode: 'walk',
    objective: 'shortest',
    area: { south: 0, west: 0, north: 0.01, east: 0.01 },
    fromCache: false,
    snapped: {
      start: { lat: 0, lon: 0, meters: 3 },
      target: { lat: 0.004, lon: 0.004, meters: 4 },
    },
    timeline: buildTimeline(graph, trace, heuristic),
    stats: summarize(trace.events),
  };
}

const tile = (name: string) => within(screen.getByText(name).closest('div')!);

describe('Inspector', () => {
  it('shows what A* knows at the current step', () => {
    const result = resultFor('astar');
    const t = result.timeline;
    render(<Inspector result={result} step={3} />);
    expect(
      screen.getByRole('heading', { name: 'What A* search is doing right now' }),
    ).toBeInTheDocument();
    expect(tile('Expanded').getByText('3')).toBeInTheDocument();
    expect(tile('In frontier').getByText(String(t.frontierSizeAt[3]))).toBeInTheDocument();
    expect(
      tile('Cost so far · g').getByText(`${Math.round(t.expandedCost[3]!)} m`),
    ).toBeInTheDocument();
    expect(
      tile('Estimate left · h').getByText(`${Math.round(t.expandedEstimate[3]!)} m`),
    ).toBeInTheDocument();
  });

  it('narrates the step', () => {
    render(<Inspector result={resultFor('astar')} step={3} />);
    const step = screen.getByRole('region', { name: 'Step 3' });
    expect(step).toHaveTextContent(/^Step 3Took the frontier node with the lowest f = g \+ h/);
  });

  it('shows roads explored instead of an estimate for algorithms without one', () => {
    render(<Inspector result={resultFor('bfs')} step={3} />);
    expect(screen.queryByText('Estimate left · h')).not.toBeInTheDocument();
    expect(screen.getByText('Roads explored')).toBeInTheDocument();
  });

  it('sums up the route once found', () => {
    const result = resultFor('astar');
    render(<Inspector result={result} step={result.timeline.steps} />);
    expect(screen.getByRole('region', { name: 'Route' })).toHaveTextContent(
      /Found a route of \d+ m in \d+ steps\./,
    );
  });
});

describe('RunCard', () => {
  it('names the algorithm and whether it is still searching', () => {
    const result = resultFor('dijkstra');
    const { rerender } = render(<RunCard result={result} step={2} />);
    expect(screen.getByRole('heading', { name: 'Dijkstra' })).toBeInTheDocument();
    expect(screen.getByText('Searching')).toBeInTheDocument();
    rerender(<RunCard result={result} step={result.timeline.steps} />);
    expect(screen.getByText('Found route')).toBeInTheDocument();
  });

  it('adds key numbers when compact', () => {
    render(<RunCard result={resultFor('astar')} step={3} compact />);
    expect(screen.getByText('Expanded').nextSibling).toHaveTextContent('3');
  });
});
