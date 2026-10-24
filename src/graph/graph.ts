/**
 * A directed, weighted graph in compressed sparse row (CSR) form.
 *
 * Edges leaving node `n` occupy indices `firstEdge[n]` up to (not including) `firstEdge[n + 1]`
 * of the edge arrays. Flat typed arrays keep large road networks compact and let the graph be
 * transferred to a Web Worker without copying.
 */
export interface Graph {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly lat: Float64Array;
  readonly lon: Float64Array;
  readonly firstEdge: Uint32Array;
  readonly edgeSource: Uint32Array;
  readonly edgeTarget: Uint32Array;
  readonly edgeWeight: Float64Array;
}

export interface GraphInput {
  nodes: readonly { lat: number; lon: number }[];
  edges: readonly { from: number; to: number; weight: number }[];
}

/** Returns the `[start, end)` range of edge indices leaving `node`. */
export function edgeRange(graph: Graph, node: number): [number, number] {
  return [graph.firstEdge[node]!, graph.firstEdge[node + 1]!];
}

/**
 * Builds a CSR graph. Edges of the same source node keep their input order. Roads never cost
 * less than nothing, so negative weights are refused unless asked for, as Learn's Bellman-Ford
 * examples do.
 */
export function buildGraph(
  { nodes, edges }: GraphInput,
  { allowNegative = false }: { allowNegative?: boolean } = {},
): Graph {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  const lat = new Float64Array(nodeCount);
  const lon = new Float64Array(nodeCount);
  nodes.forEach((node, i) => {
    lat[i] = node.lat;
    lon[i] = node.lon;
  });

  const isNode = (n: number) => Number.isInteger(n) && n >= 0 && n < nodeCount;
  const firstEdge = new Uint32Array(nodeCount + 1);
  for (const { from, to, weight } of edges) {
    if (!isNode(from) || !isNode(to)) {
      throw new RangeError(`Edge ${from} -> ${to} references a node outside 0..${nodeCount - 1}`);
    }
    if (!Number.isFinite(weight) || (weight < 0 && !allowNegative)) {
      throw new RangeError(`Edge ${from} -> ${to} has invalid weight ${weight}`);
    }
    firstEdge[from + 1]!++;
  }
  for (let n = 0; n < nodeCount; n++) firstEdge[n + 1]! += firstEdge[n]!;

  // Counting sort by source node; iterating edges in order keeps the sort stable.
  const nextSlot = firstEdge.slice(0, nodeCount);
  const edgeSource = new Uint32Array(edgeCount);
  const edgeTarget = new Uint32Array(edgeCount);
  const edgeWeight = new Float64Array(edgeCount);
  for (const { from, to, weight } of edges) {
    const e = nextSlot[from]!++;
    edgeSource[e] = from;
    edgeTarget[e] = to;
    edgeWeight[e] = weight;
  }

  return { nodeCount, edgeCount, lat, lon, firstEdge, edgeSource, edgeTarget, edgeWeight };
}
