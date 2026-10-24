import { climbFigure, contractionSteps, landmarkFigure, negativeExample } from './advanced';
import { SIX } from './networks';

describe('negativeExample', () => {
  it('shows Dijkstra stopping at T too soon, and Bellman-Ford correcting it', () => {
    const { rounds, dijkstra, outcome } = negativeExample(false);
    expect(dijkstra.cost).toBe(2);
    expect(dijkstra.taken).toEqual(['S', 'T']);
    expect(rounds.map((r) => [r.round, r.changed])).toEqual([
      [1, ['T', 'B']],
      [2, ['T']],
      [3, []],
    ]);
    expect(rounds[0]!.costs).toEqual({ S: 0, T: 2, B: 5 });
    expect(rounds[1]!.costs).toEqual({ S: 0, T: 1, B: 5 });
    expect(outcome).toEqual({ cost: 1, negativeLoop: false });
  });

  it('with the loop added, keeps lowering X, Y and Z until it reports no cheapest route', () => {
    const { rounds, outcome } = negativeExample(true);
    expect(outcome).toEqual({ cost: null, negativeLoop: true });
    const late = rounds.slice(-3);
    for (const round of late) expect(round.changed.some((id) => 'XYZ'.includes(id))).toBe(true);
  });
});

describe('landmarkFigure', () => {
  it('works out the estimate for S from a landmark beyond the goal', () => {
    expect(landmarkFigure('B')).toMatchObject({
      via: 'to',
      first: 5,
      second: 1,
      estimate: 4,
      straight: 5,
      truth: 6,
      solid: ['S', 'A', 'B'],
      dashed: ['T', 'B'],
    });
  });

  it('from one behind the start, and from the goal itself', () => {
    expect(landmarkFigure('C')).toMatchObject({ via: 'from', first: 5, second: 2, estimate: 3 });
    expect(landmarkFigure('T')).toMatchObject({ estimate: 6 });
  });
});

describe('contractionSteps', () => {
  const steps = contractionSteps(SIX, ['C', 'B', 'D', 'S', 'A', 'T']);

  it('contracts in the given order, adding a shortcut where no witness is found', () => {
    expect(steps.map((s) => s.node)).toEqual(['C', 'B', 'D', 'S', 'A', 'T']);
    expect(steps[0]!.shortcuts).toEqual([{ from: 'S', to: 'D', cost: 4 }]);
    expect(steps[1]!.shortcuts).toEqual([{ from: 'A', to: 'T', cost: 4 }]);
    expect(steps[2]!.shortcuts).toEqual([]);
  });

  it('says what each way through cost, and what the way round cost', () => {
    const b = steps[1]!.ways.find((w) => w.from === 'A' && w.to === 'T')!;
    expect(b).toMatchObject({ through: 4, round: 7, roundPath: ['A', 'D', 'T'], witness: false });
    expect(steps[2]!.ways.every((w) => w.witness)).toBe(true);
  });
});

describe('climbFigure', () => {
  const figure = climbFigure(SIX, ['C', 'B', 'D', 'S', 'A', 'T']);

  it('climbs from both ends to meet at the top, in three expansions', () => {
    expect(figure.rank).toEqual({ C: 0, B: 1, D: 2, S: 3, A: 4, T: 5 });
    expect(figure.expanded).toEqual([
      { node: 'S', side: 'A', cost: 0 },
      { node: 'T', side: 'B', cost: 0 },
      { node: 'A', side: 'A', cost: 2 },
    ]);
    expect(figure.meeting).toBe('T');
    expect(figure.climb).toEqual([
      { from: 'S', to: 'A', cost: 2, shortcut: false },
      { from: 'A', to: 'T', cost: 4, shortcut: true },
    ]);
  });

  it('unpacks to the same route Dijkstra finds, which takes more expansions', () => {
    expect(figure.route).toEqual({ path: ['S', 'A', 'B', 'T'], cost: 6 });
    expect(figure.dijkstraExpanded).toBe(6);
  });
});
