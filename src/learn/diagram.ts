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

/** Runs a real algorithm on a diagram network and records the state before each expansion. */
export function diagramStates(network: DiagramNetwork, algorithm: AlgorithmId): DiagramState[] {
  const ids = network.nodes.map((n) => n.id);
  const index = (id: string) => ids.indexOf(id);
  const graph = buildGraph({
    nodes: network.nodes.map((n) => ({ lat: n.wide[1], lon: n.wide[0] })),
    edges: network.edges.flatMap(([a, b, weight]) => [
      { from: index(a), to: index(b), weight },
      { from: index(b), to: index(a), weight },
    ]),
  });
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
    } else {
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
