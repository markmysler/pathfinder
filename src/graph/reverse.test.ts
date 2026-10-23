import fc from 'fast-check';
import { randomGeoProblem } from '../test/arbitraries';
import { graphFrom } from '../test/fixtures';
import { incomingRange, reverseIndex } from './reverse';

describe('reverseIndex', () => {
  it('lists the edges arriving at each node, in edge order', () => {
    const graph = graphFrom([
      [0, 2, 1],
      [1, 2, 1],
      [2, 0, 1],
      [1, 0, 1],
    ]);
    const index = reverseIndex(graph);
    const into = (node: number) => {
      const [start, end] = incomingRange(index, node);
      return Array.from(index.incomingEdge.subarray(start, end));
    };
    // Edges are stored by source: 0→2 is 0, 1→2 is 1, 1→0 is 2, 2→0 is 3.
    expect(into(0)).toEqual([2, 3]);
    expect(into(1)).toEqual([]);
    expect(into(2)).toEqual([0, 1]);
  });

  it('holds every edge exactly once, under the node it arrives at', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph }) => {
        const index = reverseIndex(graph);
        const seen = new Set<number>();
        for (let node = 0; node < graph.nodeCount; node++) {
          const [start, end] = incomingRange(index, node);
          for (let i = start; i < end; i++) {
            const edge = index.incomingEdge[i]!;
            expect(graph.edgeTarget[edge]).toBe(node);
            seen.add(edge);
          }
        }
        expect(seen.size).toBe(graph.edgeCount);
      }),
    );
  });

  it('is built once per graph', () => {
    const graph = graphFrom([[0, 1, 1]]);
    expect(reverseIndex(graph)).toBe(reverseIndex(graph));
  });
});
