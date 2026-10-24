import { edgeRange, type Graph } from './graph';
import { incomingRange, reverseIndex } from './reverse';

/**
 * A binary min-heap of nodes keyed by distance, on typed arrays. Entries are never updated in
 * place: a node gets a new entry when its distance drops, and outdated ones are skipped on the
 * way out. This is the fast Dijkstra used for preprocessing, which needs no events.
 */
export class NodeHeap {
  private nodes: Int32Array;
  private keys: Float64Array;
  size = 0;

  constructor(capacity = 16) {
    this.nodes = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }

  clear(): void {
    this.size = 0;
  }

  /** The smallest key; Infinity when empty. */
  peek(): number {
    return this.size ? this.keys[0]! : Infinity;
  }

  push(node: number, key: number): void {
    if (this.size === this.nodes.length) {
      const nodes = new Int32Array(2 * this.size);
      const keys = new Float64Array(2 * this.size);
      nodes.set(this.nodes);
      keys.set(this.keys);
      this.nodes = nodes;
      this.keys = keys;
    }
    let i = this.size++;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent]! <= key) break;
      this.nodes[i] = this.nodes[parent]!;
      this.keys[i] = this.keys[parent]!;
      i = parent;
    }
    this.nodes[i] = node;
    this.keys[i] = key;
  }

  /** Removes the entry with the smallest key and returns its node; call `peek` first for the key. */
  pop(): number {
    const top = this.nodes[0]!;
    const last = --this.size;
    const node = this.nodes[last]!;
    const key = this.keys[last]!;
    let i = 0;
    for (;;) {
      let child = 2 * i + 1;
      if (child >= last) break;
      if (child + 1 < last && this.keys[child + 1]! < this.keys[child]!) child++;
      if (this.keys[child]! >= key) break;
      this.nodes[i] = this.nodes[child]!;
      this.keys[i] = this.keys[child]!;
      i = child;
    }
    this.nodes[i] = node;
    this.keys[i] = key;
    return top;
  }
}

function dijkstraAll(graph: Graph, start: number, backward: boolean): Float64Array {
  const dist = new Float64Array(graph.nodeCount).fill(Infinity);
  const reverse = backward ? reverseIndex(graph) : null;
  const heap = new NodeHeap(64);
  dist[start] = 0;
  heap.push(start, 0);
  while (heap.size) {
    const key = heap.peek();
    const node = heap.pop();
    if (key > dist[node]!) continue;
    const [first, end] = reverse ? incomingRange(reverse, node) : edgeRange(graph, node);
    for (let i = first; i < end; i++) {
      const edge = reverse ? reverse.incomingEdge[i]! : i;
      const next = reverse ? graph.edgeSource[edge]! : graph.edgeTarget[edge]!;
      const d = key + graph.edgeWeight[edge]!;
      if (d < dist[next]!) {
        dist[next] = d;
        heap.push(next, d);
      }
    }
  }
  return dist;
}

/** The cheapest cost from `source` to every node; Infinity where it can't be reached. */
export const distancesFrom = (graph: Graph, source: number) => dijkstraAll(graph, source, false);

/** The cheapest cost from every node to `target`, following roads the way they go. */
export const distancesTo = (graph: Graph, target: number) => dijkstraAll(graph, target, true);
