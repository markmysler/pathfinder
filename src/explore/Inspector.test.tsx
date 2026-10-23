import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { partsOfStep, frontierAt } from '../playback/frontier';
import type { AlgorithmId } from '../algorithms';
import { fakeJobResult } from '../test/fakes';
import { Inspector, RunCard, type RunView } from './Inspector';

const resultFor = (algorithm: AlgorithmId): RunView => ({
  ...fakeJobResult(algorithm).runs[0]!,
  objective: 'shortest',
});

const names = fakeJobResult().places;
const base = { names, playing: false };

const tile = (name: string) => within(screen.getByText(name).closest('div')!);

describe('Inspector', () => {
  it('shows what A* knows at the current step', () => {
    const result = resultFor('astar');
    const t = result.timeline;
    render(<Inspector {...base} run={result} step={3} />);
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
    render(<Inspector {...base} run={resultFor('astar')} step={3} />);
    const step = screen.getByRole('region', { name: 'Step 3' });
    expect(step).toHaveTextContent(/^Step 3Took the frontier node with the lowest f = g \+ h/);
  });

  it('shows roads explored instead of an estimate for algorithms without one', () => {
    render(<Inspector {...base} run={resultFor('bfs')} step={3} />);
    expect(screen.queryByText('Estimate left · h')).not.toBeInTheDocument();
    expect(screen.getByText('Roads explored')).toBeInTheDocument();
  });

  it('sums up the route once found', () => {
    const result = resultFor('astar');
    render(<Inspector {...base} run={result} step={result.timeline.steps} />);
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
    render(<Inspector {...base} run={run} step={3} />);
    expect(screen.getByRole('region', { name: 'Step 3' })).toHaveTextContent(/g \+ 1\.5 × h/);
  });
});

describe('Inspector views', () => {
  it('opens on Now, next to the frontier and the pseudocode', () => {
    const { unmount } = render(<Inspector {...base} run={resultFor('astar')} step={3} />);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Now',
      'Frontier',
      'Pseudocode',
    ]);
    expect(screen.getByRole('tab', { name: 'Now' })).toHaveAttribute('aria-selected', 'true');
    unmount();
    render(<Inspector {...base} run={resultFor('astar')} step={3} compact />);
    expect(screen.getByRole('tab', { name: 'Code' })).toBeInTheDocument();
    // On phones the card over the map already shows the name and the numbers.
    expect(screen.queryByRole('heading', { name: /doing right now/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Expanded')).not.toBeInTheDocument();
  });

  it('lists the frontier in the order the search will take it', async () => {
    const run = resultFor('astar');
    const t = run.timeline;
    render(<Inspector {...base} run={run} step={3} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Frontier' }));
    const panel = screen.getByRole('tabpanel', { name: 'Frontier' });
    const { entries, waiting } = frontierAt(t, 3, 8);
    const rows = within(panel).getAllByRole('button');
    expect(rows).toHaveLength(entries.length);
    expect(panel).toHaveTextContent(`${waiting} waiting. A* takes the lowest f first.`);
    const first = entries[0]!;
    expect(rows[0]).toHaveTextContent('Perú & Bolívar');
    expect(rows[0]).toHaveTextContent('next');
    expect(rows[0]).toHaveTextContent(
      `${Math.round(t.entryCost[first]! + t.entryEstimate[first]!)} m`,
    );
  });

  it('rings a frontier node on the map while it is pointed at', async () => {
    const onHighlight = vi.fn();
    const run = resultFor('dijkstra');
    render(<Inspector {...base} run={run} step={2} onHighlight={onHighlight} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Frontier' }));
    const row = within(screen.getByRole('tabpanel')).getAllByRole('button')[0]!;
    await userEvent.hover(row);
    expect(onHighlight).toHaveBeenLastCalledWith([expect.any(Number), expect.any(Number)]);
    await userEvent.unhover(row);
    expect(onHighlight).toHaveBeenLastCalledWith(null);
  });

  it('goes through a paused step line by line', async () => {
    const run = resultFor('astar');
    const parts = partsOfStep(run.timeline, 3);
    render(<Inspector {...base} run={run} step={3} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Pseudocode' }));
    const panel = screen.getByRole('tabpanel', { name: 'Pseudocode' });
    expect(panel).toHaveTextContent(`line by line · 1 of ${parts.length}`);
    const current = () => panel.querySelector('[aria-current="step"]')!;
    expect(current()).toHaveTextContent('node ← frontier.popLowest()');
    expect(panel).toHaveTextContent(/Took Perú & Bolívar, the frontier node with the lowest f/);
    await userEvent.click(within(panel).getByRole('button', { name: 'Next line' }));
    expect(panel).toHaveTextContent(`2 of ${parts.length}`);
    expect(current()).toHaveTextContent(parts[1]!.kind === 'road' ? 'g[node] + c < g[next]' : '');
  });

  it('keeps to the node taken while playing', async () => {
    render(<Inspector {...base} playing run={resultFor('astar')} step={3} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Pseudocode' }));
    const panel = screen.getByRole('tabpanel', { name: 'Pseudocode' });
    expect(within(panel).getByRole('button', { name: 'Next line' })).toBeDisabled();
    expect(panel).toHaveTextContent(/Pause to go through the lines of a step one by one/);
    expect(panel.querySelector('[aria-current="step"]')).toHaveTextContent('popLowest');
  });
});

describe('Inspector for a search from both ends', () => {
  const run = resultFor('bidijkstra');
  const t = run.timeline;
  const met = t.meetStep[0]!;
  const sideCount = (step: number, side: number) =>
    [...t.expandedSide.subarray(1, step + 1)].filter((s) => s === side).length;

  it('splits its numbers between the two sides', () => {
    render(<Inspector {...base} run={run} step={met} />);
    expect(tile('Expanded')).toBeTruthy();
    expect(screen.getByText('Expanded').closest('div')).toHaveTextContent(
      `${met}${sideCount(met, 0)} from A · ${sideCount(met, 1)} from B`,
    );
    const side = t.expandedSide[met] ? 'B' : 'A';
    expect(screen.getByText(`This step · from ${side}`)).toBeInTheDocument();
    expect(screen.getByText('Best route so far').closest('div')).toHaveTextContent(
      `${Math.round(t.meetCost[0]!)} m`,
    );
  });

  it('has no best route before the sides meet', () => {
    render(<Inspector {...base} run={run} step={1} />);
    expect(screen.getByText('Best route so far').closest('div')).toHaveTextContent('—');
  });

  it('says which side took the step, whether it can stop, and where the sides met', () => {
    render(<Inspector {...base} run={run} step={met} />);
    const side = t.expandedSide[met] ? 'B' : 'A';
    const step = screen.getByRole('region', { name: `Step ${met} · from ${side}` });
    expect(step).toHaveTextContent(/so [AB] took this step|goes first on a tie/);
    const stop = screen.getByRole('region', { name: 'Can it stop yet?' });
    expect(stop).toHaveTextContent(met === t.steps ? /Yes\./ : /Not quite\./);
    expect(screen.getByRole('region', { name: 'Best meeting so far' })).toHaveTextContent(
      `found at step ${met}`,
    );
  });

  it('lists both frontiers, marking the side that goes next', async () => {
    render(<Inspector {...base} run={run} step={2} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Frontier' }));
    const fromA = screen.getByRole('region', { name: /^From A/ });
    const fromB = screen.getByRole('region', { name: /^From B/ });
    expect(fromA).toHaveTextContent(`${frontierAt(t, 2, 8, 0).waiting} waiting`);
    expect(fromB).toHaveTextContent(`${frontierAt(t, 2, 8, 1).waiting} waiting`);
    const nextSide = t.expandedSide[3] ? fromB : fromA;
    expect(within(nextSide).getAllByRole('button')[0]).toHaveTextContent('next');
    expect(screen.getAllByText('next')).toHaveLength(1);
  });

  it('shows one frontier at a time on phones', async () => {
    render(<Inspector {...base} run={run} step={2} compact />);
    await userEvent.click(screen.getByRole('tab', { name: 'Frontier' }));
    const fromB = screen.getByRole('radio', { name: /From B/ });
    expect(screen.getByRole('radio', { name: /From A/ })).toBeChecked();
    await userEvent.click(fromB);
    expect(fromB).toBeChecked();
    expect(screen.getByRole('tabpanel')).toHaveTextContent(/Cost to B, lowest first/);
  });

  it('shows the short name and the best route so far in the compact card', () => {
    render(<RunCard run={run} step={met} compact />);
    expect(screen.getByRole('heading', { name: 'Bi-Dijkstra' })).toBeInTheDocument();
    expect(screen.getByText('Best route').nextSibling).toHaveTextContent(
      `${Math.round(t.meetCost[0]!)} m`,
    );
  });

  it('starts the pseudocode on both frontiers, and ticks off the meeting and the stop', async () => {
    const { unmount } = render(<Inspector {...base} run={run} step={0} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Pseudocode' }));
    expect(screen.getByRole('tabpanel')).toHaveTextContent(
      'Start: A is in the frontier from A, and B in the frontier from B.',
    );
    expect(screen.getByRole('tabpanel').querySelector('[aria-current="step"]')).toHaveTextContent(
      'frontier B ← priority queue',
    );
    unmount();
    const meetPart = partsOfStep(t, met).findIndex((p) => p.kind === 'meet');
    render(<Inspector {...base} run={run} step={met} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Pseudocode' }));
    const panel = screen.getByRole('tabpanel');
    for (let i = 0; i < meetPart; i++) {
      await userEvent.click(within(panel).getByRole('button', { name: 'Next line' }));
    }
    expect(panel.querySelector('[aria-current="step"]')).toHaveTextContent(
      `if gA[next] + gB[next] < best ${Math.round(t.meetLength[0]!)} m < ∞ ✓`,
    );
  });

  it('walks through the meeting and the stop in the pseudocode', async () => {
    const last = t.steps;
    const parts = partsOfStep(t, last);
    render(<Inspector {...base} run={run} step={last} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Pseudocode' }));
    const panel = screen.getByRole('tabpanel', { name: 'Pseudocode' });
    expect(panel).toHaveTextContent('function biDijkstra(start, goal)');
    for (let i = 1; i < parts.length; i++) {
      await userEvent.click(within(panel).getByRole('button', { name: 'Next line' }));
    }
    expect(panel.querySelector('[aria-current="step"]')).toHaveTextContent(
      'while lowest(A) + lowest(B) < best',
    );
    expect(panel).toHaveTextContent(/Nothing left can beat it, so the search stops\./);
  });
});
