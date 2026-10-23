import { edgeRange, type Graph } from '../graph/graph';
import { incomingRange, reverseIndex } from '../graph/reverse';
import { zeroHeuristic, type Heuristic } from './heuristics';
import { MinHeap } from './minHeap';
import { checkProblem, noParents } from './support';
import type { SearchAlgorithm, SearchEvent, SearchProblem, SearchResult, Side } from './types';

interface Item {
  node: number;
  /** What the search minimises: roads for BFS, cost otherwise. */
  length: number;
  cost: number;
  entry: number;
}

/** One side's frontier, handing out the item with the lowest priority next. */
interface Frontier {
  push(item: Item, priority: number): void;
  /** The priority of the item `pop` would return; Infinity when empty. */
  peek(): number;
  pop(): Item | undefined;
}

/** A FIFO queue. With every road counting 1, it hands items out in priority order anyway. */
function queue(): Frontier {
  const items: { item: Item; priority: number }[] = [];
  let head = 0;
  return {
    push: (item, priority) => void items.push({ item, priority }),
    peek: () => items[head]?.priority ?? Infinity,
    pop: () => items[head++]?.item,
  };
}

function priorityQueue(): Frontier {
  const heap = new MinHeap<Item>();
  return {
    push: (item, priority) => heap.push(item, priority),
    peek: () => heap.peekPriority(),
    pop: () => heap.pop()?.value,
  };
}

interface Rules {
  /** Counts roads (BFS) rather than adding up their costs. */
  countRoads: boolean;
  /** Added to forward priorities and taken off backward ones. */
  tilt: Heuristic;
  frontier: () => Frontier;
}

interface SideState {
  side: Side;
  frontier: Frontier;
  best: Float64Array;
  cost: Float64Array;
  /** The edge each node was reached by: into it going forward, out of it going backward. */
  parentEdge: Int32Array;
}

/**
 * Searches forward from the source and backward from the target at once, taking turns by
 * whichever side's next node has the lower priority. Each time the sides reach a common node the
 * cheapest route known so far may improve; the search stops once the two next priorities add up
 * to at least that route, because no unexplored meeting point could then beat it.
 */
function* searchBothWays(
  problem: SearchProblem,
  rules: Rules,
): Generator<SearchEvent, SearchResult> {
  checkProblem(problem);
  const { graph, source, target } = problem;
  const reverse = reverseIndex(graph);
  const sign = { forward: 1, backward: -1 } as const;
  const newSide = (side: Side): SideState => ({
    side,
    frontier: rules.frontier(),
    best: new Float64Array(graph.nodeCount).fill(Infinity),
    cost: new Float64Array(graph.nodeCount).fill(Infinity),
    parentEdge: noParents(graph),
  });
  const forward = newSide('forward');
  const backward = newSide('backward');
  let pushes = 0;
  let bestLength = Infinity;
  let meeting = -1;

  function* reach(
    state: SideState,
    node: number,
    edge: number | null,
    length: number,
    cost: number,
  ): Generator<SearchEvent> {
    const other = state === forward ? backward : forward;
    state.best[node] = length;
    state.cost[node] = cost;
    if (edge !== null) state.parentEdge[node] = edge;
    const priority = length + sign[state.side] * rules.tilt(node);
    state.frontier.push({ node, length, cost, entry: pushes++ }, priority);
    yield { type: 'push', node, edge, cost, priority, side: state.side };
    const through = length + other.best[node]!;
    if (through < bestLength) {
      bestLength = through;
      meeting = node;
      yield { type: 'meet', node, cost: cost + other.cost[node]!, length: through };
    }
  }

  yield* reach(forward, source, null, 0, 0);
  yield* reach(backward, target, null, 0, 0);

  while (forward.frontier.peek() + backward.frontier.peek() < bestLength) {
    const state = forward.frontier.peek() <= backward.frontier.peek() ? forward : backward;
    const { node, length, cost, entry } = state.frontier.pop()!;
    if (length > state.best[node]!) {
      yield { type: 'skip', node, entry, side: state.side };
      continue;
    }
    yield { type: 'pop', node, cost, entry, side: state.side };

    const [start, end] = state === forward ? edgeRange(graph, node) : incomingRange(reverse, node);
    for (let i = start; i < end; i++) {
      const edge = state === forward ? i : reverse.incomingEdge[i]!;
      const next = state === forward ? graph.edgeTarget[edge]! : graph.edgeSource[edge]!;
      const weight = graph.edgeWeight[edge]!;
      const nextLength = length + (rules.countRoads ? 1 : weight);
      if (nextLength >= state.best[next]!) continue;
      yield* reach(state, next, edge, nextLength, cost + weight);
    }
  }

  return meeting < 0 ? { found: false } : routeThrough(graph, forward, backward, meeting);
}

function routeThrough(
  graph: Graph,
  forward: SideState,
  backward: SideState,
  meeting: number,
): SearchResult {
  const path = [meeting];
  const edges: number[] = [];
  for (let edge = forward.parentEdge[meeting]!; edge >= 0;) {
    edges.unshift(edge);
    const node = graph.edgeSource[edge]!;
    path.unshift(node);
    edge = forward.parentEdge[node]!;
  }
  for (let edge = backward.parentEdge[meeting]!; edge >= 0;) {
    edges.push(edge);
    const node = graph.edgeTarget[edge]!;
    path.push(node);
    edge = backward.parentEdge[node]!;
  }
  const cost = edges.reduce((sum, edge) => sum + graph.edgeWeight[edge]!, 0);
  return { found: true, path, edges, cost };
}

/** Breadth-first from both ends: the route with the fewest roads, found from both sides. */
export const bidirectionalBfs: SearchAlgorithm = (problem) =>
  searchBothWays(problem, { countRoads: true, tilt: zeroHeuristic, frontier: queue });

/** Dijkstra from both ends: the cheapest route, usually after exploring about half as much. */
export const bidirectionalDijkstra: SearchAlgorithm = (problem) =>
  searchBothWays(problem, { countRoads: false, tilt: zeroHeuristic, frontier: priorityQueue });

/**
 * A* from both ends. Running plain A* on each side would leave the two sides disagreeing about
 * what a road costs, so they could not tell when to stop. Instead both sides use half the
 * difference of the two estimates: forward adds it, backward takes it off. Every road then
 * looks the same from both sides, and the search stops by the same rule as bidirectional
 * Dijkstra. This needs consistent estimates, which straight-line distance is.
 */
export const bidirectionalAStar: SearchAlgorithm = (problem) => {
  const toTarget = problem.heuristic ?? zeroHeuristic;
  const fromSource = problem.backwardHeuristic ?? zeroHeuristic;
  return searchBothWays(problem, {
    countRoads: false,
    tilt: (node) => (toTarget(node) - fromSource(node)) / 2,
    frontier: priorityQueue,
  });
};
