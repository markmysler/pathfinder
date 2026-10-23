import fc from 'fast-check';
import { randomGeoProblem } from '../test/arbitraries';
import { binaryTree } from '../test/fixtures';
import { dfs } from './dfs';
import { runSearch } from './trace';

const expansionOrder = (trace: ReturnType<typeof runSearch>) =>
  trace.events.filter((e) => e.type === 'pop').map((e) => e.node);

describe('dfs', () => {
  it('dives down the first branch before trying the next', () => {
    const trace = runSearch(dfs, { graph: binaryTree(), source: 0, target: 6 });
    expect(expansionOrder(trace)).toEqual([0, 1, 3, 4, 2, 5, 6]);
  });

  it('stops as soon as it reaches the target', () => {
    const trace = runSearch(dfs, { graph: binaryTree(), source: 0, target: 4 });
    expect(expansionOrder(trace)).toEqual([0, 1, 3, 4]);
    expect(trace.result).toMatchObject({ found: true, path: [0, 1, 4] });
  });

  it('expands each node at most once', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const expanded = expansionOrder(runSearch(dfs, problem));
        expect(new Set(expanded).size).toBe(expanded.length);
      }),
    );
  });
});
