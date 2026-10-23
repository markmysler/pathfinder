import fc from 'fast-check';
import { randomGeoProblem, type RandomProblem } from '../test/arbitraries';
import { binaryTree } from '../test/fixtures';
import { referenceHops } from '../test/reference';
import { straightLineHeuristic } from './heuristics';
import { algorithms } from './index';
import { runSearch } from './trace';

// Every algorithm, present and future, must honour these rules. Adding an algorithm to the
// registry is enough to put it under test here.
describe.each(Object.values(algorithms))('$name', (algorithm) => {
  const solve = ({ graph, source, target }: RandomProblem) =>
    runSearch(algorithm.search, {
      graph,
      source,
      target,
      heuristic: straightLineHeuristic(graph, target),
    });

  it('finds a path exactly when the target is reachable', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const reachable = referenceHops(problem.graph, problem.source)[problem.target]! < Infinity;
        expect(solve(problem).result.found).toBe(reachable);
      }),
    );
  });

  it('returns a real path from source to target, costed as the sum of its edges', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const { graph, source, target } = problem;
        const { result } = solve(problem);
        if (!result.found) return;
        expect(result.path[0]).toBe(source);
        expect(result.path.at(-1)).toBe(target);
        expect(result.edges).toHaveLength(result.path.length - 1);
        let cost = 0;
        result.edges.forEach((edge, i) => {
          expect(graph.edgeSource[edge]).toBe(result.path[i]);
          expect(graph.edgeTarget[edge]).toBe(result.path[i + 1]);
          cost += graph.edgeWeight[edge]!;
        });
        expect(result.cost).toBeCloseTo(cost, 6);
      }),
    );
  });

  it('starts by pushing the source and ends by expanding the target', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const { events, result } = solve(problem);
        expect(events[0]).toMatchObject({
          type: 'push',
          node: problem.source,
          edge: null,
          cost: 0,
        });
        if (result.found)
          expect(events.at(-1)).toMatchObject({ type: 'pop', node: problem.target });
      }),
    );
  });

  it('only takes nodes out of the frontier after putting them in', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const pushed = new Set<number>();
        for (const event of solve(problem).events) {
          if (event.type === 'push') pushed.add(event.node);
          else expect(pushed.has(event.node)).toBe(true);
        }
      }),
    );
  });

  it('takes each frontier entry out exactly once, naming the push it came from', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const pushes: number[] = [];
        const taken = new Set<number>();
        for (const event of solve(problem).events) {
          if (event.type === 'push') {
            pushes.push(event.node);
            continue;
          }
          expect(pushes[event.entry]).toBe(event.node);
          expect(taken.has(event.entry)).toBe(false);
          taken.add(event.entry);
        }
      }),
    );
  });

  it('is deterministic', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        expect(solve(problem)).toEqual(solve(problem));
      }),
    );
  });

  it('returns an empty zero-cost route when already at the target', () => {
    const graph = binaryTree();
    expect(solve({ graph, source: 2, target: 2 }).result).toEqual({
      found: true,
      path: [2],
      edges: [],
      cost: 0,
    });
  });

  it('rejects source or target nodes outside the graph', () => {
    const graph = binaryTree();
    expect(() => solve({ graph, source: 7, target: 0 })).toThrow(RangeError);
    expect(() => solve({ graph, source: 0, target: -1 })).toThrow(RangeError);
  });
});
