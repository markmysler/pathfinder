import fc from 'fast-check';
import { randomGeoProblem } from '../test/arbitraries';
import { grid, hopsVsCost } from '../test/fixtures';
import { referenceDistances } from '../test/reference';
import { dijkstra } from './dijkstra';
import { straightLineHeuristic } from './heuristics';
import { runSearch } from './trace';

describe('dijkstra', () => {
  it('finds the cheapest route even when it has more edges', () => {
    const { result } = runSearch(dijkstra, { graph: hopsVsCost(), source: 0, target: 3 });
    expect(result).toEqual({ found: true, path: [0, 1, 2, 3], edges: [1, 2, 3], cost: 3 });
  });

  it('always finds the cheapest route', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source, target }) => {
        const { result } = runSearch(dijkstra, { graph, source, target });
        if (result.found) {
          expect(result.cost).toBeCloseTo(referenceDistances(graph, source)[target]!, 6);
        }
      }),
    );
  });

  it('expands nodes in order of increasing cost, each at most once', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const pops = runSearch(dijkstra, problem).events.filter((e) => e.type === 'pop');
        pops.slice(1).forEach((pop, i) => expect(pop.cost).toBeGreaterThanOrEqual(pops[i]!.cost));
        expect(new Set(pops.map((p) => p.node)).size).toBe(pops.length);
      }),
    );
  });

  it('prioritises the frontier by cost so far', () => {
    const { events } = runSearch(dijkstra, { graph: hopsVsCost(), source: 0, target: 3 });
    for (const event of events) {
      if (event.type === 'push') expect(event.priority).toBe(event.cost);
    }
  });

  it('ignores any heuristic it is given', () => {
    const graph = grid(5);
    const plain = runSearch(dijkstra, { graph, source: 0, target: 24 });
    const withHeuristic = runSearch(dijkstra, {
      graph,
      source: 0,
      target: 24,
      heuristic: straightLineHeuristic(graph, 24),
    });
    expect(withHeuristic).toEqual(plain);
  });
});
