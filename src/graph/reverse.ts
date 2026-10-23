import type { Graph } from './graph';

/**
 * The graph's edges grouped by the node they arrive at, so a search can run backwards from the
 * target. Edges arriving at `n` are `incomingEdge[firstIncoming[n]]` up to (not including)
 * `incomingEdge[firstIncoming[n + 1]]`, as indices into the graph's own edge arrays.
 */
export interface ReverseIndex {
  readonly firstIncoming: Uint32Array;
  readonly incomingEdge: Uint32Array;
}

const cache = new WeakMap<Graph, ReverseIndex>();

export function reverseIndex(graph: Graph): ReverseIndex {
  const cached = cache.get(graph);
  if (cached) return cached;

  const firstIncoming = new Uint32Array(graph.nodeCount + 1);
  for (let e = 0; e < graph.edgeCount; e++) firstIncoming[graph.edgeTarget[e]! + 1]!++;
  for (let n = 0; n < graph.nodeCount; n++) firstIncoming[n + 1]! += firstIncoming[n]!;
  // Counting sort by target; going through edges in order keeps each group in edge order.
  const nextSlot = firstIncoming.slice(0, graph.nodeCount);
  const incomingEdge = new Uint32Array(graph.edgeCount);
  for (let e = 0; e < graph.edgeCount; e++) incomingEdge[nextSlot[graph.edgeTarget[e]!]!++] = e;

  const index = { firstIncoming, incomingEdge };
  cache.set(graph, index);
  return index;
}

/** Returns the `[start, end)` range of `incomingEdge` holding the edges arriving at `node`. */
export function incomingRange(index: ReverseIndex, node: number): [number, number] {
  return [index.firstIncoming[node]!, index.firstIncoming[node + 1]!];
}
