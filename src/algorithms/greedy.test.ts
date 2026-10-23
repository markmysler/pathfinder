import fc from 'fast-check';
import { randomGeoProblem } from '../test/arbitraries';
import { greedyTrap, grid } from '../test/fixtures';
import { dijkstra } from './dijkstra';
import { greedy } from './greedy';
import { straightLineHeuristic } from './heuristics';
import { runSearch, summarize } from './trace';

describe('greedy', () => {
  it('heads straight for the target', () => {
    const graph = grid(11);
    const trace = runSearch(greedy, {
      graph,
      source: 55,
      target: 65,
      heuristic: straightLineHeuristic(graph, 65),
    });
    expect(summarize(trace.events).expanded).toBe(11);
    expect(trace.result).toMatchObject({
      found: true,
      path: [55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65],
    });
  });

  it('can be lured onto an expensive route by a node that looks close', () => {
    const graph = greedyTrap();
    const problem = { graph, source: 0, target: 3, heuristic: straightLineHeuristic(graph, 3) };
    const greedyRoute = runSearch(greedy, problem).result;
    const cheapest = runSearch(dijkstra, problem).result;
    expect(greedyRoute).toMatchObject({ found: true, path: [0, 1, 3] });
    expect(cheapest).toMatchObject({ found: true, path: [0, 2, 3] });
  });

  it('prioritises the frontier by estimated cost remaining only', () => {
    const graph = grid(4);
    const heuristic = straightLineHeuristic(graph, 15);
    const { events } = runSearch(greedy, { graph, source: 0, target: 15, heuristic });
    for (const event of events) {
      if (event.type === 'push') expect(event.priority).toBe(heuristic(event.node));
    }
  });

  it('expands each node at most once', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source, target }) => {
        const heuristic = straightLineHeuristic(graph, target);
        const expanded = runSearch(greedy, { graph, source, target, heuristic })
          .events.filter((e) => e.type === 'pop')
          .map((e) => e.node);
        expect(new Set(expanded).size).toBe(expanded.length);
      }),
    );
  });
});
