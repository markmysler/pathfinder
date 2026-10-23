import { render, screen, within } from '@testing-library/react';
import type { AlgorithmId } from '../algorithms';
import { fakeJobResult } from '../test/fakes';
import { Inspector, RunCard, type RunView } from './Inspector';

const resultFor = (algorithm: AlgorithmId): RunView => ({
  ...fakeJobResult(algorithm).runs[0]!,
  objective: 'shortest',
});

const tile = (name: string) => within(screen.getByText(name).closest('div')!);

describe('Inspector', () => {
  it('shows what A* knows at the current step', () => {
    const result = resultFor('astar');
    const t = result.timeline;
    render(<Inspector run={result} step={3} />);
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
    render(<Inspector run={resultFor('astar')} step={3} />);
    const step = screen.getByRole('region', { name: 'Step 3' });
    expect(step).toHaveTextContent(/^Step 3Took the frontier node with the lowest f = g \+ h/);
  });

  it('shows roads explored instead of an estimate for algorithms without one', () => {
    render(<Inspector run={resultFor('bfs')} step={3} />);
    expect(screen.queryByText('Estimate left · h')).not.toBeInTheDocument();
    expect(screen.getByText('Roads explored')).toBeInTheDocument();
  });

  it('sums up the route once found', () => {
    const result = resultFor('astar');
    render(<Inspector run={result} step={result.timeline.steps} />);
    expect(screen.getByRole('region', { name: 'Route' })).toHaveTextContent(
      /Found a route of \d+ m in \d+ steps\./,
    );
  });
});

describe('RunCard', () => {
  it('names the algorithm and whether it is still searching', () => {
    const result = resultFor('dijkstra');
    const { rerender } = render(<RunCard run={result} step={2} />);
    expect(screen.getByRole('heading', { name: 'Dijkstra' })).toBeInTheDocument();
    expect(screen.getByText('Searching')).toBeInTheDocument();
    rerender(<RunCard run={result} step={result.timeline.steps} />);
    expect(screen.getByText('Found route')).toBeInTheDocument();
  });

  it('adds key numbers when compact', () => {
    render(<RunCard run={resultFor('astar')} step={3} compact />);
    expect(screen.getByText('Expanded').nextSibling).toHaveTextContent('3');
  });

  it('names the weight when A* weighs its estimate, and narrates with it', () => {
    const run = { ...resultFor('astar'), weight: 1.5 };
    render(<RunCard run={run} step={3} />);
    expect(screen.getByRole('heading', { name: 'A* search · 1.5×' })).toBeInTheDocument();
    render(<Inspector run={run} step={3} />);
    expect(screen.getByRole('region', { name: 'Step 3' })).toHaveTextContent(/g \+ 1\.5 × h/);
  });
});
