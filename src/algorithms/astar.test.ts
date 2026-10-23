import fc from 'fast-check';
import { randomGeoProblem } from '../test/arbitraries';
import { graphFrom, grid } from '../test/fixtures';
import { referenceDistances } from '../test/reference';
import { aStar } from './astar';
import { dijkstra } from './dijkstra';
import { straightLineHeuristic, zeroHeuristic } from './heuristics';
import { runSearch, summarize } from './trace';

describe('aStar', () => {
  it('always finds the cheapest route with an admissible heuristic', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source, target }) => {
        const heuristic = straightLineHeuristic(graph, target);
        const { result } = runSearch(aStar, { graph, source, target, heuristic });
        if (result.found) {
          expect(result.cost).toBeCloseTo(referenceDistances(graph, source)[target]!, 6);
        }
      }),
    );
  });

  it('prioritises the frontier by cost so far plus estimated cost remaining', () => {
    const graph = grid(4);
    const heuristic = straightLineHeuristic(graph, 15);
    const { events } = runSearch(aStar, { graph, source: 0, target: 15, heuristic });
    for (const event of events) {
      if (event.type === 'push') expect(event.priority).toBe(event.cost + heuristic(event.node));
    }
  });

  it('expands far fewer nodes than Dijkstra when steered towards the target', () => {
    const graph = grid(11);
    const problem = { graph, source: 55, target: 65 }; // middle of the left edge → right edge
    const dijkstraStats = summarize(runSearch(dijkstra, problem).events);
    const aStarStats = summarize(
      runSearch(aStar, { ...problem, heuristic: straightLineHeuristic(graph, 65) }).events,
    );
    expect(aStarStats.expanded).toBeLessThan(dijkstraStats.expanded / 2);
  });

  it('behaves exactly like Dijkstra with a zero heuristic', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        expect(runSearch(aStar, { ...problem, heuristic: zeroHeuristic })).toEqual(
          runSearch(dijkstra, problem),
        );
      }),
    );
  });

  it('re-expands a node when it later finds a cheaper way to it', () => {
    // 0→1→2→3 costs 5, 0→2→3 costs 6. h(1) = 4 is admissible but inconsistent, so node 2 is
    // first expanded via the expensive edge and must be expanded again.
    const graph = graphFrom([
      [0, 1, 1],
      [0, 2, 3],
      [1, 2, 1],
      [2, 3, 3],
    ]);
    const estimates = [0, 4, 0, 0];
    const { events, result } = runSearch(aStar, {
      graph,
      source: 0,
      target: 3,
      heuristic: (node) => estimates[node]!,
    });
    expect(events.filter((e) => e.type === 'pop' && e.node === 2)).toHaveLength(2);
    expect(result).toMatchObject({ found: true, path: [0, 1, 2, 3], cost: 5 });
  });
});
