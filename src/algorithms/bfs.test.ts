import fc from 'fast-check';
import { randomGeoProblem } from '../test/arbitraries';
import { binaryTree, hopsVsCost } from '../test/fixtures';
import { referenceHops } from '../test/reference';
import { bfs } from './bfs';
import { runSearch } from './trace';

const expansionOrder = (trace: ReturnType<typeof runSearch>) =>
  trace.events.filter((e) => e.type === 'pop').map((e) => e.node);

describe('bfs', () => {
  it('finds the route with the fewest edges, ignoring weights', () => {
    const { result } = runSearch(bfs, { graph: hopsVsCost(), source: 0, target: 3 });
    expect(result).toEqual({ found: true, path: [0, 3], edges: [0], cost: 10 });
  });

  it('expands level by level', () => {
    const trace = runSearch(bfs, { graph: binaryTree(), source: 0, target: 6 });
    expect(expansionOrder(trace)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('always finds the minimum number of hops', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source, target }) => {
        const { result } = runSearch(bfs, { graph, source, target });
        if (result.found) expect(result.edges.length).toBe(referenceHops(graph, source)[target]);
      }),
    );
  });

  it('puts each node in the frontier at most once', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const pushed = runSearch(bfs, problem)
          .events.filter((e) => e.type === 'push')
          .map((e) => e.node);
        expect(new Set(pushed).size).toBe(pushed.length);
      }),
    );
  });
});
