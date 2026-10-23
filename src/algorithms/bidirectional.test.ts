import fc from 'fast-check';
import { randomGeoProblem, type RandomProblem } from '../test/arbitraries';
import { grid, undirectedGraphFrom } from '../test/fixtures';
import { referenceDistances, referenceHops } from '../test/reference';
import { aStar } from './astar';
import { bfs } from './bfs';
import { bidirectionalAStar, bidirectionalBfs, bidirectionalDijkstra } from './bidirectional';
import { dijkstra } from './dijkstra';
import { straightLineHeuristic } from './heuristics';
import { runSearch, summarize } from './trace';
import type { SearchAlgorithm, SearchEvent } from './types';

const informed = ({ graph, source, target }: RandomProblem) => ({
  graph,
  source,
  target,
  heuristic: straightLineHeuristic(graph, target),
  backwardHeuristic: straightLineHeuristic(graph, source),
});

const ALL: [string, SearchAlgorithm][] = [
  ['bidirectionalBfs', bidirectionalBfs],
  ['bidirectionalDijkstra', bidirectionalDijkstra],
  ['bidirectionalAStar', bidirectionalAStar],
];

/** 0 – 1 – 2 – 3 – 4, every road costing 1 both ways. */
const line = () =>
  undirectedGraphFrom([
    [0, 1, 1],
    [1, 2, 1],
    [2, 3, 1],
    [3, 4, 1],
  ]);

const brief = (events: SearchEvent[]) =>
  events.map((e) =>
    e.type === 'meet'
      ? `meet ${e.node}`
      : `${e.type} ${e.side === 'backward' ? 'B' : 'F'}${e.node}`,
  );

describe('bidirectional searches: the same answer as going one way', () => {
  it('bidirectional Dijkstra finds a route exactly as cheap as Dijkstra', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const one = runSearch(dijkstra, problem).result;
        const two = runSearch(bidirectionalDijkstra, problem).result;
        expect(two.found).toBe(one.found);
        if (one.found && two.found) expect(two.cost).toBeCloseTo(one.cost, 6);
      }),
    );
  });

  it('bidirectional A* finds a route exactly as cheap as A*', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const one = runSearch(aStar, informed(problem)).result;
        const two = runSearch(bidirectionalAStar, informed(problem)).result;
        expect(two.found).toBe(one.found);
        if (one.found && two.found) {
          expect(two.cost).toBeCloseTo(one.cost, 6);
          expect(two.cost).toBeCloseTo(
            referenceDistances(problem.graph, problem.source)[problem.target]!,
            6,
          );
        }
      }),
    );
  });

  it('bidirectional BFS finds a route with as few roads as BFS', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const one = runSearch(bfs, problem).result;
        const two = runSearch(bidirectionalBfs, problem).result;
        expect(two.found).toBe(one.found);
        if (one.found && two.found) {
          expect(two.edges).toHaveLength(one.edges.length);
          expect(two.edges).toHaveLength(
            referenceHops(problem.graph, problem.source)[problem.target]!,
          );
        }
      }),
    );
  });
});

describe.each(ALL)('%s', (_, search) => {
  const solve = (problem: RandomProblem) => runSearch(search, informed(problem));

  it('starts from both ends: the source going forward, then the target going backward', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        fc.pre(problem.source !== problem.target);
        const [first, second] = solve(problem).events;
        expect(first).toMatchObject({ type: 'push', node: problem.source, edge: null, cost: 0 });
        expect(first).toMatchObject({ side: 'forward' });
        expect(second).toMatchObject({ type: 'push', node: problem.target, edge: null, cost: 0 });
        expect(second).toMatchObject({ side: 'backward' });
      }),
    );
  });

  it('reaches backward pushes by roads leading out of them, costed to the target', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const { graph, target } = problem;
        const distanceToTarget = (node: number) => referenceDistances(graph, node)[target]!;
        for (const event of solve(problem).events) {
          if (event.type !== 'push' || event.side !== 'backward' || event.edge === null) continue;
          expect(graph.edgeSource[event.edge]).toBe(event.node);
          expect(event.cost).toBeGreaterThanOrEqual(distanceToTarget(event.node) - 1e-6);
        }
      }),
    );
  });

  it('announces each better meeting point, ending with the route it returns', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const { events, result } = solve(problem);
        const meets = events.filter((e) => e.type === 'meet');
        // BFS improves by number of roads, which can cost more.
        if (search !== bidirectionalBfs)
          meets.slice(1).forEach((meet, i) => expect(meet.cost).toBeLessThan(meets[i]!.cost));
        if (!result.found) {
          expect(meets).toEqual([]);
          return;
        }
        const last = meets.at(-1)!;
        expect(result.path).toContain(last.node);
        expect(last.cost).toBeCloseTo(result.cost, 6);
      }),
    );
  });

  it('meets straight away when already at the target', () => {
    const { events, result } = runSearch(search, { graph: line(), source: 2, target: 2 });
    expect(brief(events)).toEqual(['push F2', 'push B2', 'meet 2']);
    expect(result).toEqual({ found: true, path: [2], edges: [], cost: 0 });
  });

  it('takes turns by whichever side has the nearer next node, and stops once sure', () => {
    // Both sides grow one road at a time and touch in the middle, at node 2. Neither side can
    // then find anything cheaper than the 4 roads through it, so the search stops.
    const { events, result } = runSearch(search, { graph: line(), source: 0, target: 4 });
    expect(brief(events)).toEqual([
      'push F0',
      'push B4',
      'pop F0',
      'push F1',
      'pop B4',
      'push B3',
      'pop F1',
      'push F2',
      'pop B3',
      'push B2',
      'meet 2',
    ]);
    expect(result).toMatchObject({ found: true, path: [0, 1, 2, 3, 4], cost: 4 });
  });
});

describe('bidirectionalBfs', () => {
  it('orders each side by roads from its end, and measures meetings in roads', () => {
    const graph = undirectedGraphFrom([
      [0, 1, 5],
      [1, 2, 7],
    ]);
    const { events } = runSearch(bidirectionalBfs, { graph, source: 0, target: 2 });
    const pushes = events.filter((e) => e.type === 'push');
    expect(pushes.map((p) => [p.node, p.priority])).toEqual([
      [0, 0],
      [2, 0],
      [1, 1],
      [1, 1],
    ]);
    expect(events.filter((e) => e.type === 'meet')).toEqual([
      { type: 'meet', node: 1, cost: 12, length: 2 },
    ]);
  });
});

describe('bidirectionalDijkstra', () => {
  it('keeps going after the sides first touch, until no cheaper meeting is possible', () => {
    // The sides first touch at node 1 (via the costly 0 → 1 → 4 road), but the cheapest route
    // goes 0 → 2 → 3 → 4.
    const graph = undirectedGraphFrom([
      [0, 1, 1],
      [1, 4, 10],
      [0, 2, 2],
      [2, 3, 2],
      [3, 4, 2],
    ]);
    const { events, result } = runSearch(bidirectionalDijkstra, { graph, source: 0, target: 4 });
    const meets = events.filter((e) => e.type === 'meet');
    expect(meets.map((m) => [m.node, m.cost, m.length])).toEqual([
      [1, 11, 11],
      [3, 6, 6],
    ]);
    expect(result).toMatchObject({ path: [0, 2, 3, 4], cost: 6 });
  });

  it('expands far fewer nodes than Dijkstra on an open grid', () => {
    const graph = grid(15);
    const problem = { graph, source: 7 * 15 + 2, target: 7 * 15 + 12 };
    const one = summarize(runSearch(dijkstra, problem).events);
    const two = summarize(runSearch(bidirectionalDijkstra, problem).events);
    expect(two.expanded).toBeLessThan(one.expanded * 0.7);
  });
});
