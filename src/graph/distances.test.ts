import fc from 'fast-check';
import { randomGeoProblem } from '../test/arbitraries';
import { graphFrom } from '../test/fixtures';
import { referenceDistances } from '../test/reference';
import { distancesFrom, distancesTo } from './distances';

describe('distancesFrom', () => {
  it('matches the reference distances from a node to every other', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source }) => {
        const got = distancesFrom(graph, source);
        referenceDistances(graph, source).forEach((d, n) =>
          d === Infinity ? expect(got[n]).toBe(Infinity) : expect(got[n]).toBeCloseTo(d, 6),
        );
      }),
    );
  });
});

describe('distancesTo', () => {
  it('measures every node’s distance to the given one, following one-way roads', () => {
    const graph = graphFrom([
      [0, 1, 2],
      [1, 2, 3],
      [2, 0, 4],
    ]);
    expect([...distancesTo(graph, 0)]).toEqual([0, 7, 4]);
  });

  it('matches the reference distances run backwards', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, target }) => {
        const got = distancesTo(graph, target);
        for (let n = 0; n < graph.nodeCount; n++) {
          const d = referenceDistances(graph, n)[target]!;
          if (d === Infinity) expect(got[n]).toBe(Infinity);
          else expect(got[n]).toBeCloseTo(d, 6);
        }
      }),
    );
  });
});
