import { algorithms, type AlgorithmId } from '../algorithms';
import { runSearch } from '../algorithms/trace';
import { buildGraph } from '../graph/graph';
import type { DiagramNetwork } from './networks';

export interface FrontierItem {
  id: string;
  g: number;
  h: number;
}

/** The moment before an expansion: what is done, what is waiting and what comes next. */
export interface DiagramState {
  explored: string[];
  next: string;
  /** Waiting nodes in the order the algorithm takes them; `next` comes first. */
  frontier: FrontierItem[];
  /** Every node reached so far: its best cost and the node it was reached from. */
  reached: Map<string, { g: number; from: string | null }>;
  /** Set on the last state, once the search has reached T. */
  route: { path: string[]; cost: number } | null;
}

/** A diagram network as a graph, with its node ids in graph order. */
function graphOf(network: DiagramNetwork) {
  const ids = network.nodes.map((n) => n.id);
  const index = (id: string) => ids.indexOf(id);
  const graph = buildGraph({
    nodes: network.nodes.map((n) => ({ lat: n.wide[1], lon: n.wide[0] })),
    edges: network.edges.flatMap(([a, b, weight]) => [
      { from: index(a), to: index(b), weight },
      { from: index(b), to: index(a), weight },
    ]),
  });
  return { ids, index, graph };
}

/** Runs a real algorithm on a diagram network and records the state before each expansion. */
export function diagramStates(network: DiagramNetwork, algorithm: AlgorithmId): DiagramState[] {
  const { ids, index, graph } = graphOf(network);
  const h = network.nodes.map((n) => n.h);
  const { events, result } = runSearch(algorithms[algorithm].search, {
    graph,
    source: index(network.source),
    target: index(network.target),
    heuristic: (node) => h[node]!,
  });

  const rule = algorithms[algorithm].frontier;
  type Entry = { node: number; g: number; priority: number; order: number; from: number | null };
  const waiting = new Map<number, Entry>();
  const reached = new Map<string, { g: number; from: string | null }>();
  const explored: string[] = [];
  const states: DiagramState[] = [];
  let pushes = 0;

  for (const event of events) {
    if (event.type === 'push') {
      const from = event.edge === null ? null : graph.edgeSource[event.edge]!;
      const order = pushes++;
      waiting.set(order, {
        node: event.node,
        g: event.cost,
        priority: event.priority ?? order,
        order,
        from,
      });
      // An older entry for the same node is outdated now; the newer one is what counts.
      for (const [key, entry] of waiting)
        if (entry.node === event.node && key !== order) waiting.delete(key);
      const best = reached.get(ids[event.node]!);
      if (!best || event.cost < best.g || rule !== 'priority') {
        reached.set(ids[event.node]!, { g: event.cost, from: from === null ? null : ids[from]! });
      }
    } else if (event.type === 'skip') {
      waiting.delete(event.entry);
    } else if (event.type === 'pop') {
      const sorted = [...waiting.values()].sort((a, b) =>
        rule === 'queue'
          ? a.order - b.order
          : rule === 'stack'
            ? b.order - a.order
            : a.priority - b.priority || a.order - b.order,
      );
      // The heap's own tie-breaking decides; put the entry it really took first.
      const taken = waiting.get(event.entry)!;
      const frontier = [taken, ...sorted.filter((e) => e !== taken)]
        .filter((e) => !explored.includes(ids[e.node]!))
        .map((e) => ({ id: ids[e.node]!, g: e.g, h: h[e.node]! }));
      states.push({
        explored: [...explored],
        next: ids[event.node]!,
        frontier,
        reached: new Map(reached),
        route: null,
      });
      waiting.delete(event.entry);
      explored.push(ids[event.node]!);
    }
  }
  if (result.found && states.length) {
    states.at(-1)!.route = { path: result.path.map((n) => ids[n]!), cost: result.cost };
  }
  return states;
}

const SPOKEN: Record<AlgorithmId, string> = {
  bfs: 'Breadth-first search',
  dfs: 'Depth-first search',
  greedy: 'Greedy best-first',
  dijkstra: 'Dijkstra',
  astar: 'A*',
  bibfs: 'Bidirectional BFS',
  bidijkstra: 'Bidirectional Dijkstra',
  biastar: 'Bidirectional A*',
};

/** "S", "S and A", "S, A and C". */
export function listOf(items: readonly string[]) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

/** The number each algorithm orders its frontier by, if any. */
function keyOf(
  algorithm: AlgorithmId,
  item: FrontierItem,
): { label: string; value: number } | null {
  if (algorithm === 'astar') return { label: 'f', value: item.g + item.h };
  if (algorithm === 'dijkstra') return { label: 'g', value: item.g };
  if (algorithm === 'greedy') return { label: 'h', value: item.h };
  return null;
}

/**
 * What a diagram step shows, in words. `bestCost` is the cheapest route there is, so the final
 * step can say how good the route found was.
 */
export function caption(state: DiagramState, algorithm: AlgorithmId, bestCost?: number): string {
  const name = SPOKEN[algorithm];
  const { explored, next, frontier, route } = state;
  const rule = algorithms[algorithm].frontier;
  const holder = rule === 'queue' ? 'queue' : rule === 'stack' ? 'stack' : 'frontier';

  if (route) {
    const path = route.path.join(' → ');
    const verdict =
      bestCost === undefined
        ? '.'
        : route.cost <= bestCost
          ? ', the cheapest there is.'
          : `; the cheapest costs ${bestCost}.`;
    return `${name} takes ${next}, the destination, and stops. Its route ${path} costs ${route.cost}${verdict}`;
  }
  if (explored.length === 0) return `Only ${next} is in the ${holder}, so ${name} takes it first.`;

  const done = `${listOf(explored)} ${explored.length === 1 ? 'is' : 'are'} explored.`;
  const shown = frontier.map((item) => {
    const key = keyOf(algorithm, item);
    return key ? `${item.id} (${key.label} ${key.value})` : item.id;
  });
  const holds = `The ${holder} holds ${listOf(shown)}.`;

  const first = frontier[0]!;
  const key = keyOf(algorithm, first);
  let why =
    rule === 'queue'
      ? 'it has waited longest'
      : rule === 'stack'
        ? 'it joined most recently'
        : algorithm === 'greedy'
          ? 'it looks closest to T'
          : `it has the lowest ${key!.label}`;
  if (key) {
    const tied = frontier.slice(1).filter((item) => keyOf(algorithm, item)!.value === key.value);
    if (tied.length) why += `, tied with ${listOf(tied.map((t) => t.id))}`;
  }
  let contrast = '';
  if (algorithm === 'astar') {
    const cheapest = frontier.reduce((a, b) => (b.g < a.g ? b : a));
    if (cheapest.g < first.g) {
      contrast = `, even though ${cheapest.id} is cheaper to reach. Dijkstra would have taken ${cheapest.id}`;
    }
  }
  return `${done} ${holds} ${name} takes ${next} next: ${why}${contrast}.`;
}

type Side = 'A' | 'B';

/** A step of a search from both ends, just after it: what each side has done and holds. */
export interface BothWaysState {
  side: Side;
  took: string;
  /** Nodes this step reached more cheaply, in the order it reached them. */
  reachedNow: string[];
  explored: Record<Side, string[]>;
  /** Each side's waiting nodes, in the order it will take them. */
  frontier: Record<Side, FrontierItem[]>;
  /** Each side's best cost to every node it reached, and the node it came from. */
  reached: Record<Side, Map<string, { g: number; from: string | null }>>;
  /** The best meeting so far, and whether this step found it. */
  meeting: { id: string; fromA: number; toB: number; isNew: boolean } | null;
  /** Each side's next priority: what the stop rule adds up. Infinity once a side is empty. */
  next: Record<Side, number>;
  /** Set on the last step, once the search is sure. */
  route: { path: string[]; cost: number } | null;
}

/** Runs a search from both ends on a diagram network, recording the state after each step. */
export function bothWaysStates(network: DiagramNetwork, algorithm: AlgorithmId): BothWaysState[] {
  const { ids, index, graph } = graphOf(network);
  const h = network.nodes.map((n) => n.h);
  const { events, result } = runSearch(algorithms[algorithm].search, {
    graph,
    source: index(network.source),
    target: index(network.target),
    heuristic: (node) => h[node]!,
  });
  const queue = algorithms[algorithm].frontier === 'queue';
  type Entry = { node: number; g: number; priority: number; order: number };
  const waiting = { A: new Map<number, Entry>(), B: new Map<number, Entry>() };
  const reached = { A: new Map<string, { g: number; from: string | null }>(), B: new Map() };
  const explored: Record<Side, string[]> = { A: [], B: [] };
  const states: BothWaysState[] = [];
  let meeting: BothWaysState['meeting'] = null;
  let pushes = 0;

  const ordered = (side: Side) =>
    [...waiting[side].values()].sort((a, b) =>
      queue ? a.order - b.order : a.priority - b.priority || a.order - b.order,
    );
  const finish = () => {
    const state = states.at(-1);
    if (!state) return;
    for (const side of ['A', 'B'] as const) {
      const items = ordered(side);
      state.frontier[side] = items.map((e) => ({ id: ids[e.node]!, g: e.g, h: h[e.node]! }));
      state.next[side] = items[0]?.priority ?? Infinity;
      state.reached[side] = new Map(reached[side]);
      state.explored[side] = [...explored[side]];
    }
    state.meeting = meeting;
  };

  for (const event of events) {
    if (event.type === 'meet') {
      const last = states.at(-1);
      const ofA = reached.A.get(ids[event.node]!)!.g;
      meeting = { id: ids[event.node]!, fromA: ofA, toB: event.cost - ofA, isNew: !!last };
      continue;
    }
    const side: Side = event.side === 'backward' ? 'B' : 'A';
    if (event.type === 'push') {
      const edge = event.edge;
      const from =
        edge === null ? null : side === 'A' ? graph.edgeSource[edge]! : graph.edgeTarget[edge]!;
      const order = pushes++;
      for (const [key, entry] of waiting[side])
        if (entry.node === event.node) waiting[side].delete(key);
      waiting[side].set(order, {
        node: event.node,
        g: event.cost,
        priority: event.priority ?? order,
        order,
      });
      reached[side].set(ids[event.node]!, {
        g: event.cost,
        from: from === null ? null : ids[from]!,
      });
      states.at(-1)?.reachedNow.push(ids[event.node]!);
    } else if (event.type === 'skip') {
      waiting[side].delete(event.entry);
    } else {
      finish();
      if (meeting) meeting = { ...meeting, isNew: false };
      waiting[side].delete(event.entry);
      explored[side].push(ids[event.node]!);
      states.push({
        side,
        took: ids[event.node]!,
        reachedNow: [],
        explored: { A: [], B: [] },
        frontier: { A: [], B: [] },
        reached: { A: new Map(), B: new Map() },
        meeting: null,
        next: { A: Infinity, B: Infinity },
        route: null,
      });
    }
  }
  finish();
  if (result.found && states.length) {
    states.at(-1)!.route = { path: result.path.map((n) => ids[n]!), cost: result.cost };
  }
  return states;
}

/** The route through a meeting point, from what each side reached. */
function pathThrough(state: BothWaysState, meeting: string) {
  const back: string[] = [];
  for (let id: string | null = meeting; id; id = state.reached.A.get(id)?.from ?? null) {
    back.unshift(id);
  }
  for (let id = state.reached.B.get(meeting)?.from ?? null; id;) {
    back.push(id);
    id = state.reached.B.get(id)?.from ?? null;
  }
  return back;
}

/** What a step of a search from both ends shows, in words, up to whether it can stop. */
export function bothWaysCaption(state: BothWaysState): string {
  const { side, took, reachedNow, meeting, next, route } = state;
  const reachedText = reachedNow.length
    ? `reached ${listOf([...reachedNow].sort())}`
    : 'reached nothing new';
  let text = `${side} explored ${took} and ${reachedText}.`;
  if (!meeting) return `${text} The sides have not met yet.`;

  const best = meeting.fromA + meeting.toB;
  if (meeting.isNew) {
    const other = side === 'A' ? 'B' : 'A';
    const path = pathThrough(state, meeting.id).join(' → ');
    text += ` ${other} had already reached ${meeting.id}, so the sides meet there: ${path} costs ${meeting.fromA} + ${meeting.toB} = ${best}.`;
  } else {
    text += ` Best route so far: ${best}.`;
  }
  const sum = next.A + next.B;
  const nexts = `The next nodes are ${next.A} from A and ${next.B} from B, together ${sum}`;
  if (route) {
    return `${text} ${nexts}: no less than ${best}, so nothing left can beat it. The search stops.`;
  }
  if (meeting.isNew) {
    return `${text} That is not the answer yet. ${nexts}, so a route through unexplored roads could still cost less than ${best}.`;
  }
  return `${text} ${nexts}, still less than ${best}, so the search goes on.`;
}

/** One road slowed by traffic: its two ends, and its speed as a share of free flow. */
export interface Jam {
  road: readonly [string, string];
  share: number;
}

export interface RushHour {
  /** Dijkstra's best route with the traffic. */
  route: { path: string[]; cost: number };
  /** With a jam: the route on clear roads, and what those roads cost now. */
  before: { path: string[]; cost: number; costNow: number } | null;
  /** Each road's cost on clear roads and now, keyed like "A–B" in the network's order. */
  costs: Map<string, { usual: number; now: number }>;
}

/** Runs Dijkstra on a diagram network, with one road slowed by traffic if `jam` is given. */
export function rushHour(network: DiagramNetwork, jam: Jam | null): RushHour {
  const isJammed = ([a, b]: readonly [string, string, number]) =>
    jam !== null &&
    ((a === jam.road[0] && b === jam.road[1]) || (a === jam.road[1] && b === jam.road[0]));
  const slowed: DiagramNetwork = {
    ...network,
    edges: network.edges.map((edge) =>
      isJammed(edge) ? [edge[0], edge[1], edge[2] / jam!.share] : edge,
    ),
  };
  const best = (net: DiagramNetwork) => {
    const { ids, index, graph } = graphOf(net);
    const { result } = runSearch(algorithms.dijkstra.search, {
      graph,
      source: index(net.source),
      target: index(net.target),
    });
    if (!result.found) throw new Error('Diagram networks always connect S and T');
    return { path: result.path.map((node) => ids[node]!), cost: result.cost };
  };
  const costs = new Map(
    network.edges.map((edge, i) => [
      `${edge[0]}–${edge[1]}`,
      { usual: edge[2], now: slowed.edges[i]![2] },
    ]),
  );
  const route = best(slowed);
  if (!jam) return { route, before: null, costs };
  const clear = best(network);
  const costOf = (path: string[]) =>
    path.slice(1).reduce((sum, to, i) => {
      const from = path[i]!;
      const cost = costs.get(`${from}–${to}`) ?? costs.get(`${to}–${from}`);
      return sum + cost!.now;
    }, 0);
  return { route, before: { ...clear, costNow: costOf(clear.path) }, costs };
}
