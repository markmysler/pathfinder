import { algorithms } from '../algorithms';
import { graphFrom, grid, hopsVsCost } from '../test/fixtures';
import { solve } from '../test/timelines';
import { bellmanFordRounds } from './rounds';

describe('bellmanFordRounds', () => {
  // 0 → 3 directly costs 10; 0 → 1 → 2 → 3 costs 3 but takes three rounds to find.
  const { timeline } = solve({ graph: hopsVsCost(), source: 0, target: 3 }, algorithms.bellmanford);
  const rounds = bellmanFordRounds(timeline, 3);

  it('gives each step its round, and where each round starts', () => {
    // Steps: 0 (round 0), 3 and 1 (round 1), 2 (round 2), 3 again (round 3).
    expect([...rounds.roundAt]).toEqual([0, 0, 1, 1, 2, 3]);
    expect(rounds.count).toBe(4);
    expect([...rounds.firstStep]).toEqual([1, 2, 4, 5]);
  });

  it('finds the step a round starts at, for stepping a round at a time', () => {
    expect(rounds.startOf(0)).toBe(1);
    expect(rounds.startOf(2)).toBe(4);
    expect(rounds.startOf(9)).toBe(timeline.steps);
  });

  it('tells corrections apart: expanding a node again because it got cheaper', () => {
    expect([...rounds.previousExpansion]).toEqual([0, 0, 0, 0, 0, 2]);
    expect([...rounds.distinctBy]).toEqual([0, 1, 2, 3, 4, 4]);
  });

  it('follows the best cost known for B, and how often it improved', () => {
    expect([...rounds.targetCostAt]).toEqual([Infinity, 10, 10, 10, 3, 3]);
    expect([...rounds.targetImprovedBy]).toEqual([0, 0, 0, 0, 1, 1]);
    expect(rounds.targetFirst).toEqual({ step: 1, cost: 10, round: 1 });
  });

  it('leaves B unreached when no road leads there', () => {
    const graph = graphFrom([[0, 1, 1]], { nodeCount: 3 });
    const { timeline: t } = solve({ graph, source: 0, target: 2 }, algorithms.bellmanford);
    const r = bellmanFordRounds(t, 2);
    expect(r.targetFirst).toBeNull();
    expect(r.targetCostAt[t.steps]).toBe(Infinity);
  });

  it('counts rounds on a larger map without going backwards', () => {
    const { timeline: t } = solve(
      { graph: grid(6), source: 0, target: 35 },
      algorithms.bellmanford,
    );
    const r = bellmanFordRounds(t, 35);
    for (let step = 2; step <= t.steps; step++) {
      expect(r.roundAt[step]).toBeGreaterThanOrEqual(r.roundAt[step - 1]!);
    }
    expect(r.count).toBe(r.roundAt[t.steps]! + 1);
  });
});
