import { NodeHeap } from '../graph/distances';
import type { Graph } from '../graph/graph';
import { MinHeap } from './minHeap';
import { checkProblem } from './support';
import type { SearchEvent, SearchProblem, SearchResult, Side } from './types';

/**
 * A contraction hierarchy: every node ranked by importance, plus the shortcuts that keep
 * distances right once less important nodes are taken out. Edge numbers below `baseEdgeCount`
 * are the graph's own edges; the rest are shortcuts, each standing for two edges in a row.
 */
export interface Hierarchy {
  nodeCount: number;
  /** Each node's place in the contraction order: 0 was contracted first, so matters least. */
  rank: Uint32Array;
  /** The nodes in the order they were contracted. */
  order: Uint32Array;
  baseEdgeCount: number;
  edgeCount: number;
  edgeFrom: Uint32Array;
  edgeTo: Uint32Array;
  edgeWeight: Float64Array;
  /** Per shortcut (edge number minus `baseEdgeCount`): its two edges and the node it skips. */
  shortcutFirst: Uint32Array;
  shortcutSecond: Uint32Array;
  shortcutVia: Uint32Array;
  /** Edges leaving each node for a more important one: `upEdge[upFirst[n] .. upFirst[n + 1])`. */
  upFirst: Uint32Array;
  upEdge: Uint32Array;
  /** Edges arriving at each node from a more important one. */
  downFirst: Uint32Array;
  downEdge: Uint32Array;
}

export interface ContractOptions {
  /** Contract in exactly this order instead of choosing, as the Learn diagrams do. */
  order?: readonly number[];
  /** How many nodes a witness search may settle before giving up and adding the shortcut. */
  witnessLimit?: number;
  /** Called every so often with how many nodes are contracted so far. */
  onProgress?(contracted: number, total: number): void;
}

/** Roads in or out of one node among those not yet contracted, as parallel arrays. */
interface Links {
  node: number[];
  weight: number[];
  edge: number[];
}

const links = (): Links => ({ node: [], weight: [], edge: [] });

/** The cheapest link to each neighbour, ignoring contracted ones, `skip` and parallel dearer ones. */
function cheapest(list: Links, skip: number) {
  const best = new Map<number, { weight: number; edge: number }>();
  for (let i = 0; i < list.node.length; i++) {
    const n = list.node[i]!;
    if (n === skip) continue;
    const known = best.get(n);
    if (!known || list.weight[i]! < known.weight)
      best.set(n, { weight: list.weight[i]!, edge: list.edge[i]! });
  }
  return best;
}

/**
 * Contracts the graph's nodes one by one, least important first. Taking out node v, every pair
 * of neighbours u → v → w whose cheapest connection runs through v gets a shortcut u → w; a
 * short local search for another way at least as cheap (a witness) shows when it isn't needed.
 * Importance is the edge difference (shortcuts added minus roads removed) plus how many
 * neighbours are already contracted, which spreads contraction evenly over the map.
 */
export function contract(graph: Graph, options: ContractOptions = {}): Hierarchy {
  const { nodeCount } = graph;
  const { witnessLimit = 60, onProgress } = options;
  const outs = Array.from({ length: nodeCount }, links);
  const ins = Array.from({ length: nodeCount }, links);
  const edgeFrom: number[] = [];
  const edgeTo: number[] = [];
  const edgeWeight: number[] = [];
  const shortcutFirst: number[] = [];
  const shortcutSecond: number[] = [];
  const shortcutVia: number[] = [];

  const addEdge = (from: number, to: number, weight: number) => {
    const edge = edgeFrom.length;
    edgeFrom.push(from);
    edgeTo.push(to);
    edgeWeight.push(weight);
    if (from !== to) {
      outs[from]!.node.push(to);
      outs[from]!.weight.push(weight);
      outs[from]!.edge.push(edge);
      ins[to]!.node.push(from);
      ins[to]!.weight.push(weight);
      ins[to]!.edge.push(edge);
    }
    return edge;
  };
  for (let e = 0; e < graph.edgeCount; e++) {
    addEdge(graph.edgeSource[e]!, graph.edgeTarget[e]!, graph.edgeWeight[e]!);
  }
  const baseEdgeCount = edgeFrom.length;

  // Witness searches share these, resetting only what they touched.
  const dist = new Float64Array(nodeCount).fill(Infinity);
  const touched: number[] = [];
  const heap = new NodeHeap(64);
  const witnessCosts = (from: number, avoid: number, maxCost: number) => {
    for (const n of touched) dist[n] = Infinity;
    touched.length = 0;
    heap.clear();
    dist[from] = 0;
    touched.push(from);
    heap.push(from, 0);
    let settled = 0;
    while (heap.size && heap.peek() <= maxCost && settled < witnessLimit) {
      const key = heap.peek();
      const node = heap.pop();
      if (key > dist[node]!) continue;
      settled++;
      const out = outs[node]!;
      for (let i = 0; i < out.node.length; i++) {
        const next = out.node[i]!;
        if (next === avoid) continue;
        const d = key + out.weight[i]!;
        if (d < dist[next]!) {
          if (dist[next] === Infinity) touched.push(next);
          dist[next] = d;
          heap.push(next, d);
        }
      }
    }
  };

  /** The shortcuts contracting `v` would need now, as [u, w, weight, first, second]. */
  const shortcutsFor = (v: number) => {
    const needed: [number, number, number, number, number][] = [];
    const into = cheapest(ins[v]!, v);
    const outOf = cheapest(outs[v]!, v);
    for (const [u, toV] of into) {
      let maxCost = -1;
      for (const [w, fromV] of outOf)
        if (w !== u) maxCost = Math.max(maxCost, toV.weight + fromV.weight);
      if (maxCost < 0) continue;
      witnessCosts(u, v, maxCost);
      for (const [w, fromV] of outOf) {
        if (w === u) continue;
        const through = toV.weight + fromV.weight;
        if (dist[w]! > through) needed.push([u, w, through, toV.edge, fromV.edge]);
      }
    }
    return { needed, degree: into.size + outOf.size };
  };

  const contracted = new Uint8Array(nodeCount);
  const deletedNeighbours = new Uint32Array(nodeCount);
  const priorityOf = (v: number) => {
    const { needed, degree } = shortcutsFor(v);
    return needed.length - degree + deletedNeighbours[v]!;
  };

  const order: number[] = [];
  const contractNode = (v: number) => {
    for (const [u, w, weight, first, second] of shortcutsFor(v).needed) {
      addEdge(u, w, weight);
      shortcutFirst.push(first);
      shortcutSecond.push(second);
      shortcutVia.push(v);
    }
    contracted[v] = 1;
    order.push(v);
    // Take v out of its neighbours' lists, so later searches never see it.
    const neighbours = new Set([...outs[v]!.node, ...ins[v]!.node]);
    neighbours.delete(v);
    for (const n of neighbours) {
      for (const list of [outs[n]!, ins[n]!]) {
        let kept = 0;
        for (let i = 0; i < list.node.length; i++) {
          if (list.node[i] === v) continue;
          list.node[kept] = list.node[i]!;
          list.weight[kept] = list.weight[i]!;
          list.edge[kept] = list.edge[i]!;
          kept++;
        }
        list.node.length = list.weight.length = list.edge.length = kept;
      }
      deletedNeighbours[n]!++;
    }
    return neighbours;
  };

  const report = (count: number) => {
    if (onProgress && (count % 256 === 0 || count === nodeCount)) onProgress(count, nodeCount);
  };
  if (options.order) {
    for (const v of options.order) {
      contractNode(v);
      report(order.length);
    }
  } else {
    // Lazy updates: a node's priority is checked again when it comes up, and it goes back in if
    // it has grown past the next one's.
    const priority = new Float64Array(nodeCount);
    const queue = new NodeHeap(nodeCount);
    for (let v = 0; v < nodeCount; v++) {
      priority[v] = priorityOf(v);
      queue.push(v, priority[v]!);
    }
    while (queue.size) {
      const key = queue.peek();
      const v = queue.pop();
      if (contracted[v] || key !== priority[v]) continue;
      const now = priorityOf(v);
      if (now > queue.peek()) {
        priority[v] = now;
        queue.push(v, now);
        continue;
      }
      for (const n of contractNode(v)) {
        if (contracted[n]) continue;
        priority[n] = priorityOf(n);
        queue.push(n, priority[n]!);
      }
      report(order.length);
    }
  }

  const rank = new Uint32Array(nodeCount);
  order.forEach((node, r) => (rank[node] = r));
  const edgeCount = edgeFrom.length;
  // Each edge goes up from its less important end: forward from its start, or backward from its end.
  const upFirst = new Uint32Array(nodeCount + 1);
  const downFirst = new Uint32Array(nodeCount + 1);
  for (let e = 0; e < edgeCount; e++) {
    const [from, to] = [edgeFrom[e]!, edgeTo[e]!];
    if (from === to) continue;
    if (rank[from]! < rank[to]!) upFirst[from + 1]!++;
    else downFirst[to + 1]!++;
  }
  for (let n = 0; n < nodeCount; n++) {
    upFirst[n + 1]! += upFirst[n]!;
    downFirst[n + 1]! += downFirst[n]!;
  }
  const upEdge = new Uint32Array(upFirst[nodeCount]!);
  const downEdge = new Uint32Array(downFirst[nodeCount]!);
  const upSlot = upFirst.slice(0, nodeCount);
  const downSlot = downFirst.slice(0, nodeCount);
  for (let e = 0; e < edgeCount; e++) {
    const [from, to] = [edgeFrom[e]!, edgeTo[e]!];
    if (from === to) continue;
    if (rank[from]! < rank[to]!) upEdge[upSlot[from]!++] = e;
    else downEdge[downSlot[to]!++] = e;
  }

  return {
    nodeCount,
    rank,
    order: Uint32Array.from(order),
    baseEdgeCount,
    edgeCount,
    edgeFrom: Uint32Array.from(edgeFrom),
    edgeTo: Uint32Array.from(edgeTo),
    edgeWeight: Float64Array.from(edgeWeight),
    shortcutFirst: Uint32Array.from(shortcutFirst),
    shortcutSecond: Uint32Array.from(shortcutSecond),
    shortcutVia: Uint32Array.from(shortcutVia),
    upFirst,
    upEdge,
    downFirst,
    downEdge,
  };
}

/** Replaces every shortcut among `edges` with the graph edges it stands for, in order. */
export function unpack(hierarchy: Hierarchy, edges: readonly number[]): number[] {
  const out: number[] = [];
  const stack = [...edges].reverse();
  while (stack.length) {
    const edge = stack.pop()!;
    if (edge < hierarchy.baseEdgeCount) {
      out.push(edge);
      continue;
    }
    const i = edge - hierarchy.baseEdgeCount;
    stack.push(hierarchy.shortcutSecond[i]!, hierarchy.shortcutFirst[i]!);
  }
  return out;
}

interface Item {
  node: number;
  cost: number;
  entry: number;
}

/**
 * The contraction hierarchies query: Dijkstra from both ends, each side only ever moving to more
 * important nodes, forward from the start and backward from the goal. The best route climbs to
 * its most important node and comes down again, so the two sides meet there. Unlike
 * bidirectional Dijkstra a side can't stop when the two meet: it stops once its cheapest waiting
 * node costs at least the best route found, since everything after would cost more.
 */
export function* contractionHierarchies(
  problem: SearchProblem,
): Generator<SearchEvent, SearchResult> {
  checkProblem(problem);
  const { graph, source, target } = problem;
  const h = problem.hierarchy ?? contract(graph);
  const sides = (['forward', 'backward'] as const).map((side) => ({
    side,
    frontier: new MinHeap<Item>(),
    best: new Float64Array(graph.nodeCount).fill(Infinity),
    parentEdge: new Int32Array(graph.nodeCount).fill(-1),
  }));
  const [forward, backward] = sides as [(typeof sides)[0], (typeof sides)[0]];
  let pushes = 0;
  let bestCost = Infinity;
  let meeting = -1;

  function* reach(state: typeof forward, node: number, edge: number | null, cost: number) {
    const other = state === forward ? backward : forward;
    state.best[node] = cost;
    if (edge !== null) state.parentEdge[node] = edge;
    state.frontier.push({ node, cost, entry: pushes++ }, cost);
    yield { type: 'push', node, edge, cost, priority: cost, side: state.side as Side } as const;
    const through = cost + other.best[node]!;
    if (through < bestCost) {
      bestCost = through;
      meeting = node;
      yield { type: 'meet', node, cost: through, length: through } as const;
    }
  }

  yield* reach(forward, source, null, 0);
  yield* reach(backward, target, null, 0);

  while (Math.min(forward.frontier.peekPriority(), backward.frontier.peekPriority()) < bestCost) {
    const state =
      forward.frontier.peekPriority() <= backward.frontier.peekPriority() ? forward : backward;
    const { node, cost, entry } = state.frontier.pop()!.value;
    if (cost > state.best[node]!) {
      yield { type: 'skip', node, entry, side: state.side };
      continue;
    }
    yield { type: 'pop', node, cost, entry, side: state.side };
    const up = state === forward;
    const [first, list] = up ? [h.upFirst, h.upEdge] : [h.downFirst, h.downEdge];
    for (let i = first[node]!; i < first[node + 1]!; i++) {
      const edge = list[i]!;
      const next = up ? h.edgeTo[edge]! : h.edgeFrom[edge]!;
      const nextCost = cost + h.edgeWeight[edge]!;
      if (nextCost >= state.best[next]!) continue;
      yield* reach(state, next, edge, nextCost);
    }
  }
  if (meeting < 0) return { found: false };

  const climb: number[] = [];
  for (let n = meeting; forward.parentEdge[n]! >= 0; n = h.edgeFrom[forward.parentEdge[n]!]!) {
    climb.unshift(forward.parentEdge[n]!);
  }
  for (let n = meeting; backward.parentEdge[n]! >= 0; n = h.edgeTo[backward.parentEdge[n]!]!) {
    climb.push(backward.parentEdge[n]!);
  }
  const edges = unpack(h, climb);
  const path = [source, ...edges.map((e) => graph.edgeTarget[e]!)];
  const cost = edges.reduce((sum, e) => sum + graph.edgeWeight[e]!, 0);
  return { found: true, path, edges, cost };
}
