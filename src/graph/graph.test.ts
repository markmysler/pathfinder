import { buildGraph, edgeRange } from './graph';

const coords = (n: number) => Array.from({ length: n }, (_, i) => ({ lat: i, lon: i }));

function neighbors(graph: ReturnType<typeof buildGraph>, node: number) {
  const [start, end] = edgeRange(graph, node);
  const result = [];
  for (let e = start; e < end; e++) {
    result.push({ to: graph.edgeTarget[e], weight: graph.edgeWeight[e] });
  }
  return result;
}

describe('buildGraph', () => {
  it('stores node coordinates', () => {
    const graph = buildGraph({ nodes: [{ lat: 1.5, lon: -2.5 }], edges: [] });
    expect(graph.nodeCount).toBe(1);
    expect(graph.lat[0]).toBe(1.5);
    expect(graph.lon[0]).toBe(-2.5);
  });

  it('groups outgoing edges by source node', () => {
    const graph = buildGraph({
      nodes: coords(3),
      edges: [
        { from: 2, to: 0, weight: 5 },
        { from: 0, to: 1, weight: 1 },
        { from: 0, to: 2, weight: 2 },
      ],
    });
    expect(graph.edgeCount).toBe(3);
    expect(neighbors(graph, 0)).toEqual([
      { to: 1, weight: 1 },
      { to: 2, weight: 2 },
    ]);
    expect(neighbors(graph, 1)).toEqual([]);
    expect(neighbors(graph, 2)).toEqual([{ to: 0, weight: 5 }]);
  });

  it('keeps input order among edges of the same node', () => {
    const graph = buildGraph({
      nodes: coords(4),
      edges: [
        { from: 0, to: 3, weight: 1 },
        { from: 0, to: 1, weight: 1 },
        { from: 0, to: 2, weight: 1 },
      ],
    });
    expect(neighbors(graph, 0).map((n) => n.to)).toEqual([3, 1, 2]);
  });

  it('records the source of every edge', () => {
    const graph = buildGraph({
      nodes: coords(3),
      edges: [
        { from: 2, to: 1, weight: 1 },
        { from: 1, to: 0, weight: 1 },
      ],
    });
    for (let node = 0; node < graph.nodeCount; node++) {
      const [start, end] = edgeRange(graph, node);
      for (let e = start; e < end; e++) expect(graph.edgeSource[e]).toBe(node);
    }
  });

  it('treats edges as directed', () => {
    const graph = buildGraph({ nodes: coords(2), edges: [{ from: 0, to: 1, weight: 1 }] });
    expect(neighbors(graph, 0)).toHaveLength(1);
    expect(neighbors(graph, 1)).toHaveLength(0);
  });

  it('rejects edges that reference unknown nodes', () => {
    expect(() => buildGraph({ nodes: coords(2), edges: [{ from: 0, to: 2, weight: 1 }] })).toThrow(
      RangeError,
    );
    expect(() => buildGraph({ nodes: coords(2), edges: [{ from: -1, to: 0, weight: 1 }] })).toThrow(
      RangeError,
    );
  });

  it('rejects negative or non-finite weights', () => {
    for (const weight of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => buildGraph({ nodes: coords(2), edges: [{ from: 0, to: 1, weight }] })).toThrow(
        RangeError,
      );
    }
  });
});
