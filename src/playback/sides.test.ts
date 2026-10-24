import fc from 'fast-check';
import { algorithms, type AlgorithmInfo } from '../algorithms';
import { runSearch } from '../algorithms/trace';
import { randomGeoProblem, type RandomProblem } from '../test/arbitraries';
import { graphFrom, undirectedGraphFrom } from '../test/fixtures';
import { solve as solveWith } from '../test/timelines';
import { climbStopCheck, meetingSplit, sideNext, stopCheck } from './sides';
import { buildTimeline, meetingAt } from './timeline';

const twoWay = fc.constantFrom(algorithms.bibfs, algorithms.bidijkstra, algorithms.biastar);

const solve = (problem: RandomProblem, algorithm: AlgorithmInfo) =>
  solveWith(problem, algorithm).timeline;

describe('sideNext', () => {
  it("is each side's lowest-priority waiting entry, oldest first on a tie, or -1", () => {
    fc.assert(
      fc.property(randomGeoProblem(), twoWay, (problem, algorithm) => {
        const t = solve(problem, algorithm);
        for (let step = 0; step <= t.steps; step++) {
          const expected = [-1, -1];
          for (let e = 0; e < t.entryCount; e++) {
            if (t.entryEnter[e]! > step || t.entryLeave[e]! <= step) continue;
            const side = t.entrySide[e]!;
            const best = expected[side]!;
            if (best < 0 || t.entryPriority[e]! < t.entryPriority[best]!) expected[side] = e;
          }
          expect(sideNext(t, step)).toEqual(expected);
        }
      }),
    );
  });

  it('names the entry the next step takes, when the step does not skip first', () => {
    fc.assert(
      fc.property(randomGeoProblem(), twoWay, (problem, algorithm) => {
        const t = solve(problem, algorithm);
        for (let step = 1; step <= t.steps; step++) {
          const taken = t.expandedEntry[step]!;
          const next = sideNext(t, step - 1)[t.entrySide[taken]!]!;
          if (t.entryStale[next]! > step - 1) expect(next).toBe(taken);
        }
      }),
    );
  });
});

describe('stopCheck', () => {
  /** 0 – 1 – 2 – 3 – 4, every road costing 1. */
  const line = undirectedGraphFrom([
    [0, 1, 1],
    [1, 2, 1],
    [2, 3, 1],
    [3, 4, 1],
  ]);
  const t = buildTimeline(
    line,
    runSearch(algorithms.bidijkstra.search, { graph: line, source: 0, target: 4 }),
  );

  it('adds the two next priorities and compares them with the best route so far', () => {
    // Before meeting there is no best route yet, so the search cannot stop.
    expect(stopCheck(t, 2)).toEqual({ next: [1, 1], sum: 2, best: Infinity, canStop: false });
    // The last step meets at node 2: 2 + 2 = 4 reaches the 4-road route, so it is final.
    expect(stopCheck(t, t.steps)).toEqual({ next: [2, 2], sum: 4, best: 4, canStop: true });
  });

  it('can stop once a side throws away its last, outdated entry', () => {
    // A reaches 1 twice and B is reached only from 3: no route. The search ends when A skips the
    // dearer way to 1 and has nothing left, while 3 still waits on B's side.
    const apart = graphFrom([
      [0, 1, 2],
      [0, 1, 1],
      [3, 2, 3],
    ]);
    const trace = runSearch(algorithms.bidijkstra.search, { graph: apart, source: 0, target: 2 });
    expect(trace.events.at(-1)?.type).toBe('skip');
    const t = buildTimeline(apart, trace);
    expect(stopCheck(t, t.steps)).toEqual({
      next: [Infinity, 3],
      sum: Infinity,
      best: Infinity,
      canStop: true,
    });
  });

  it('is only sure of the route at the last step', () => {
    fc.assert(
      fc.property(randomGeoProblem(), twoWay, (problem, algorithm) => {
        const t = solve(problem, algorithm);
        for (let step = 0; step < t.steps; step++) expect(stopCheck(t, step).canStop).toBe(false);
        expect(stopCheck(t, t.steps).canStop).toBe(true);
      }),
    );
  });
});

describe('meetingSplit', () => {
  it('splits a meeting into its cost from A and its cost to B', () => {
    fc.assert(
      fc.property(randomGeoProblem(), twoWay, (problem, algorithm) => {
        const t = solve(problem, algorithm);
        for (let i = 0; i < t.meetCount; i++) {
          const { fromA, toB } = meetingSplit(t, i);
          expect(fromA).toBeGreaterThanOrEqual(0);
          expect(toB).toBeGreaterThanOrEqual(0);
          expect(fromA + toB).toBeCloseTo(t.meetCost[i]!, 6);
        }
        const last = meetingAt(t, t.steps);
        if (t.route && last >= 0) expect(t.meetCost[last]).toBeCloseTo(t.route.cost, 6);
      }),
    );
  });
});

describe('climbStopCheck', () => {
  it('stops contraction hierarchies once neither side’s next node can beat the best route', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const t = solve(problem, algorithms.ch);
        for (let step = 0; step < t.steps; step++) {
          const check = climbStopCheck(t, step);
          expect(check.canStop).toBe(false);
          expect(Math.min(...check.next)).toBeLessThan(check.best);
        }
        const last = climbStopCheck(t, t.steps);
        expect(last.canStop).toBe(true);
        expect(Math.min(...last.next)).toBeGreaterThanOrEqual(last.best);
      }),
    );
  });

  it('only counts entries still worth taking: outdated ones would be skipped', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const t = solve(problem, algorithms.ch);
        for (let step = 0; step <= t.steps; step++) {
          climbStopCheck(t, step).entries.forEach((entry) => {
            if (entry < 0) return;
            expect(t.entryEnter[entry]).toBeLessThanOrEqual(step);
            expect(t.entryStale[entry]).toBeGreaterThan(step);
          });
        }
      }),
    );
  });
});
