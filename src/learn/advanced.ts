import { algorithms } from '../algorithms';
import { bellmanFord } from '../algorithms/bellmanFord';
import { dijkstra } from '../algorithms/dijkstra';
import { climbEdges, contract, contractionHierarchies } from '../algorithms/hierarchy';
import { landmarkHeuristic, landmarksAt } from '../algorithms/landmarks';
import { runSearch, summarize } from '../algorithms/trace';
import { buildGraph, type Graph } from '../graph/graph';
import { graphOf } from './diagram';
import { SIX, type DiagramNetwork } from './networks';

// ---- Bellman-Ford: roads that cost less than nothing ----------------------------------------

/** Where the negative-cost example's nodes are drawn, in a 340 × 220 box. */
export const NEGATIVE_LAYOUT: Record<string, readonly [number, number]> = {
  S: [60, 170],
  B: [170, 50],
  T: [280, 170],
  X: [210, 110],
  Y: [300, 60],
  Z: [320, 120],
};

/** Energy in kWh: the hill from B down to T gives 4 back. The loop round X, Y, Z costs −1. */
export const NEGATIVE_ROADS: readonly (readonly [string, string, number])[] = [
  ['S', 'T', 2],
  ['S', 'B', 5],
  ['B', 'T', -4],
];
export const NEGATIVE_LOOP: readonly (readonly [string, string, number])[] = [
  ['T', 'X', 1],
  ['X', 'Y', 2],
  ['Y', 'Z', 1],
  ['Z', 'X', -4],
];

export interface RoundState {
  round: number;
  /** The cheapest cost known for each node reached, once the round is done. */
  costs: Record<string, number>;
  /** Nodes that got cheaper in this round; none means Bellman-Ford is done. */
  changed: string[];
}

export interface NegativeExample {
  roads: readonly (readonly [string, string, number])[];
  rounds: RoundState[];
  /** Dijkstra on the same roads: the nodes it took, in order, and the answer it gave. */
  dijkstra: { taken: string[]; costs: Record<string, number>; cost: number };
  outcome: { cost: number | null; negativeLoop: boolean };
}

/** The real Bellman-Ford and Dijkstra on a tiny network where one road gives energy back. */
export function negativeExample(withLoop: boolean): NegativeExample {
  const roads = withLoop ? [...NEGATIVE_ROADS, ...NEGATIVE_LOOP] : NEGATIVE_ROADS;
  const ids = ['S', 'B', 'T', ...(withLoop ? ['X', 'Y', 'Z'] : [])];
  const graph: Graph = buildGraph(
    {
      nodes: ids.map(() => ({ lat: 0, lon: 0 })),
      edges: roads.map(([from, to, weight]) => ({
        from: ids.indexOf(from),
        to: ids.indexOf(to),
        weight,
      })),
    },
    { allowNegative: true },
  );
  const problem = { graph, source: 0, target: ids.indexOf('T') };

  const bf = runSearch(bellmanFord, problem);
  const rounds: RoundState[] = [];
  const costs: Record<string, number> = { S: 0 };
  const last = Math.max(0, ...bf.events.map((e) => (e.type === 'push' ? e.priority! : 0)));
  // A finished search gets one more round, the one that changes nothing.
  const through = bf.result.found ? last + 1 : last;
  for (let round = 1; round <= through; round++) {
    const changed: string[] = [];
    for (const event of bf.events) {
      if (event.type !== 'push' || event.priority !== round) continue;
      const id = ids[event.node]!;
      costs[id] = event.cost;
      if (!changed.includes(id)) changed.push(id);
    }
    rounds.push({ round, costs: { ...costs }, changed });
  }

  const dj = runSearch(dijkstra, problem);
  const taken: string[] = [];
  const dijkstraCosts: Record<string, number> = {};
  for (const event of dj.events) {
    if (event.type === 'pop') taken.push(ids[event.node]!);
    if (event.type === 'push') dijkstraCosts[ids[event.node]!] = event.cost;
  }
  return {
    roads,
    rounds,
    dijkstra: { taken, costs: dijkstraCosts, cost: dj.result.found ? dj.result.cost : NaN },
    outcome: {
      cost: bf.result.found ? bf.result.cost : null,
      negativeLoop: !bf.result.found && Boolean(bf.result.negativeLoop),
    },
  };
}

// ---- ALT: the triangle trick ----------------------------------------------------------------

export interface LandmarkFigure {
  /** 'to': the landmark lies beyond the goal; 'from': behind the start. */
  via: 'to' | 'from' | null;
  /** The estimate is the first cost minus the second. */
  first: number;
  second: number;
  estimate: number;
  /** A*'s straight-line guess for S, and the true cost from S to T. */
  straight: number;
  truth: number;
  /** The route behind the first cost, drawn solid, and the one behind the second, dashed. */
  solid: string[];
  dashed: string[];
}

/** ALT's estimate for S on the six-node network, with one landmark at `landmark`. */
export function landmarkFigure(landmark: string, network: DiagramNetwork = SIX): LandmarkFigure {
  const { ids, index, graph } = graphOf(network);
  const [s, t, l] = [index(network.source), index(network.target), index(landmark)];
  const landmarks = landmarksAt(graph, [l]);
  const { estimate, via } = landmarkHeuristic(landmarks, t).explain(s);
  const route = (from: number, to: number) => {
    const { result } = runSearch(dijkstra, { graph, source: from, target: to });
    return result.found ? { path: result.path.map((n) => ids[n]!), cost: result.cost } : null;
  };
  // Beyond the goal: S → L, less T → L. Behind the start: L → T, less L → S.
  const [one, two] = via === 'from' ? [route(l, t), route(l, s)] : [route(s, l), route(t, l)];
  return {
    via,
    first: one?.cost ?? 0,
    second: two?.cost ?? 0,
    estimate,
    straight: network.nodes[s]!.h,
    truth: route(s, t)!.cost,
    solid: one?.path ?? [],
    dashed: two?.path ?? [],
  };
}

// ---- Contraction hierarchies ----------------------------------------------------------------

export interface Way {
  from: string;
  to: string;
  /** Going through the node being contracted. */
  through: number;
  /** The cheapest way round it among the nodes left, if any. */
  round: number | null;
  roundPath: string[];
  /** The way round is at least as cheap: no shortcut needed. */
  witness: boolean;
}

export interface ContractionStep {
  node: string;
  ways: Way[];
  shortcuts: { from: string; to: string; cost: number }[];
}

/** The cheapest route over `edges` from `from` to `to`, a plain Dijkstra on a handful of nodes. */
function cheapestOver(
  edges: readonly { from: number; to: number; weight: number }[],
  from: number,
  to: number,
) {
  const best = new Map([[from, { cost: 0, path: [from] }]]);
  const done = new Set<number>();
  for (;;) {
    let next: number | null = null;
    for (const [node, { cost }] of best) {
      if (!done.has(node) && (next === null || cost < best.get(next)!.cost)) next = node;
    }
    if (next === null) return null;
    if (next === to) return best.get(to)!;
    done.add(next);
    const here = best.get(next)!;
    for (const edge of edges) {
      if (edge.from !== next) continue;
      const cost = here.cost + edge.weight;
      if (cost < (best.get(edge.to)?.cost ?? Infinity)) {
        best.set(edge.to, { cost, path: [...here.path, edge.to] });
      }
    }
  }
}

/**
 * Contracts the network in a fixed order with the real contraction, and says for each node
 * what every way through it cost, and the way round it, if one was as cheap: a witness.
 */
export function contractionSteps(network: DiagramNetwork, order: readonly string[]) {
  const { ids, index, graph } = graphOf(network);
  const h = contract(graph, { order: order.map(index) });
  const gone = new Set<number>();
  return order.map((id, step): ContractionStep => {
    const v = index(id);
    // The roads and shortcuts among the nodes left, as the contraction saw them.
    const made = h.baseEdgeCount + h.shortcutsBy[step]!;
    const edges: { from: number; to: number; weight: number }[] = [];
    for (let e = 0; e < made; e++) {
      const [from, to] = [h.edgeFrom[e]!, h.edgeTo[e]!];
      if (!gone.has(from) && !gone.has(to)) edges.push({ from, to, weight: h.edgeWeight[e]! });
    }
    const into = edges.filter((e) => e.to === v);
    const out = edges.filter((e) => e.from === v);
    const ways: Way[] = [];
    for (const a of into) {
      for (const b of out) {
        if (a.from === b.to || a.from > b.to) continue;
        const through = a.weight + b.weight;
        const round = cheapestOver(
          edges.filter((e) => e.from !== v && e.to !== v),
          a.from,
          b.to,
        );
        ways.push({
          from: ids[a.from]!,
          to: ids[b.to]!,
          through,
          round: round?.cost ?? null,
          roundPath: round?.path.map((n) => ids[n]!) ?? [],
          witness: round !== null && round.cost <= through,
        });
      }
    }
    gone.add(v);
    const shortcuts: ContractionStep['shortcuts'] = [];
    for (let i = h.shortcutsBy[step]!; i < h.shortcutsBy[step + 1]!; i++) {
      const e = h.baseEdgeCount + i;
      const [from, to] = [ids[h.edgeFrom[e]!]!, ids[h.edgeTo[e]!]!];
      // The network runs both ways, so each shortcut is made in both directions: list it once.
      if (!shortcuts.some((s) => s.from === to && s.to === from)) {
        shortcuts.push({ from, to, cost: h.edgeWeight[e]! });
      }
    }
    return { node: id, ways, shortcuts };
  });
}

/** The contraction hierarchies search on the network, contracted in `order`. */
export function climbFigure(network: DiagramNetwork, order: readonly string[]) {
  const { ids, index, graph } = graphOf(network);
  const h = contract(graph, { order: order.map(index) });
  const problem = { graph, source: index(network.source), target: index(network.target) };
  const { events, result } = runSearch(contractionHierarchies, { ...problem, hierarchy: h });
  const rank = Object.fromEntries(ids.map((id, n) => [id, h.rank[n]!]));
  const expanded = events.flatMap((e) =>
    e.type === 'pop'
      ? [{ node: ids[e.node]!, side: e.side === 'backward' ? 'B' : 'A', cost: e.cost }]
      : [],
  );
  const meetings = events.filter((e) => e.type === 'meet');
  const climb = climbEdges(events, h).map((e) => ({
    from: ids[h.edgeFrom[e]!]!,
    to: ids[h.edgeTo[e]!]!,
    cost: h.edgeWeight[e]!,
    shortcut: e >= h.baseEdgeCount,
  }));
  return {
    rank,
    expanded,
    meeting: meetings.length ? ids[meetings.at(-1)!.node]! : null,
    climb,
    route: result.found ? { path: result.path.map((n) => ids[n]!), cost: result.cost } : null,
    dijkstraExpanded: summarize(runSearch(algorithms.dijkstra.search, problem).events).expanded,
  };
}
