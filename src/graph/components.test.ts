import fc from 'fast-check';
import { randomGeoProblem } from '../test/arbitraries';
import { graphFrom, undirectedGraphFrom } from '../test/fixtures';
import { referenceHops } from '../test/reference';
import { largestStronglyConnectedComponent } from './components';

const members = (mask: Uint8Array) => [...mask.keys()].filter((i) => mask[i]);

describe('largestStronglyConnectedComponent', () => {
  it('includes every node of a cycle', () => {
    const graph = graphFrom([
      [0, 1, 1],
      [1, 2, 1],
      [2, 0, 1],
    ]);
    expect(members(largestStronglyConnectedComponent(graph))).toEqual([0, 1, 2]);
  });

  it('leaves out a one-way dead end you could never drive back from', () => {
    const graph = graphFrom([
      [0, 1, 1],
      [1, 0, 1],
      [1, 2, 1],
      [2, 1, 1],
      [2, 3, 1],
    ]);
    expect(members(largestStronglyConnectedComponent(graph))).toEqual([0, 1, 2]);
  });

  it('picks the bigger of two separate road networks', () => {
    const graph = undirectedGraphFrom([
      [0, 1, 1],
      [2, 3, 1],
      [3, 4, 1],
    ]);
    expect(members(largestStronglyConnectedComponent(graph))).toEqual([2, 3, 4]);
  });

  it('handles an empty graph', () => {
    expect(largestStronglyConnectedComponent(graphFrom([])).length).toBe(0);
  });

  it('marks a largest set of nodes that can all reach each other', () => {
    fc.assert(
      fc.property(randomGeoProblem(10), ({ graph }) => {
        const reach = Array.from({ length: graph.nodeCount }, (_, n) => referenceHops(graph, n));
        const mutual = (a: number, b: number) =>
          reach[a]![b]! < Infinity && reach[b]![a]! < Infinity;
        const mask = largestStronglyConnectedComponent(graph);
        const inside = members(mask);
        const first = inside[0]!;
        for (let n = 0; n < graph.nodeCount; n++) expect(mutual(first, n)).toBe(mask[n] === 1);
        const largest = Math.max(
          ...Array.from(
            { length: graph.nodeCount },
            (_, a) => reach.filter((_, b) => mutual(a, b)).length,
          ),
        );
        expect(inside.length).toBe(largest);
      }),
    );
  });
});
