import type { AlgorithmId } from '../algorithms';
import type { Objective } from '../osm/network';
import { labelOf, type NodeLabels } from '../osm/places';
import type { StepPart } from '../playback/frontier';
import type { Timeline } from '../playback/timeline';
import { formatCost } from '../ui/format';

type NarratedTimeline = Pick<
  Timeline,
  'steps' | 'expandedCost' | 'expandedEstimate' | 'pushesAt' | 'expandedDegree' | 'route'
>;

export type SearchStatus = 'searching' | 'found' | 'no-route';

export function searchStatus(
  timeline: Pick<Timeline, 'steps' | 'route'>,
  position: number,
): SearchStatus {
  if (position < timeline.steps) return 'searching';
  return timeline.route ? 'found' : 'no-route';
}

/** How to say what pushing a neighbour means for each algorithm: some, none, or not via the only road. */
const ROADS: Record<AlgorithmId, { some: string; none: string; onlyNot: string }> = {
  bfs: {
    some: 'led somewhere new',
    none: 'led anywhere new',
    onlyNot: 'did not lead anywhere new',
  },
  greedy: {
    some: 'led somewhere new',
    none: 'led anywhere new',
    onlyNot: 'did not lead anywhere new',
  },
  dfs: {
    some: 'led somewhere not yet explored',
    none: 'led anywhere not yet explored',
    onlyNot: 'did not lead anywhere not yet explored',
  },
  dijkstra: {
    some: 'reached a neighbour more cheaply',
    none: 'reached a neighbour more cheaply',
    onlyNot: 'did not reach a neighbour more cheaply',
  },
  astar: {
    some: 'reached a neighbour more cheaply',
    none: 'reached a neighbour more cheaply',
    onlyNot: 'did not reach a neighbour more cheaply',
  },
};

function describeRoads(algorithm: AlgorithmId, pushes: number, degree: number): string {
  const phrases = ROADS[algorithm];
  if (degree === 0) return 'It is a dead end.';
  const joined =
    pushes === 0 ? '' : pushes === 1 ? ' It joined the frontier.' : ' They joined the frontier.';
  if (degree === 1)
    return pushes ? `Its only road ${phrases.some}.${joined}` : `Its only road ${phrases.onlyNot}.`;
  if (pushes === 0) return `None of its ${degree} roads ${phrases.none}.`;
  return `${pushes} of ${degree} roads ${phrases.some}.${joined}`;
}

/** A plain-language account of what the search did at a step. */
export function describeStep(
  timeline: NarratedTimeline,
  step: number,
  algorithm: AlgorithmId,
  objective: Objective,
  /** Weight on the estimate; only A* uses one. */
  weight = 1,
): string {
  if (step <= 0) return 'Start: A is the only node in the frontier.';
  if (step >= timeline.steps) {
    const route = timeline.route;
    if (!route) return 'The frontier is empty: there is no route to B.';
    return objective === 'fastest'
      ? `Reached B. The route takes ${formatCost(route.cost, objective)}.`
      : `Reached B. The route is ${formatCost(route.cost, objective)} long.`;
  }

  const cost = (value: number) => formatCost(value, objective);
  const g = timeline.expandedCost[step]!;
  const w = Math.round(weight * 10) / 10;
  const h = timeline.expandedEstimate[step]!;
  const choice = {
    bfs: 'Took the oldest node in the queue.',
    dfs: 'Took the newest node on the stack.',
    greedy: `Took the frontier node that looks closest to B (estimate ${cost(h)}).`,
    dijkstra: `Took the frontier node with the lowest cost so far, ${cost(g)}.`,
    astar:
      weight === 1
        ? `Took the frontier node with the lowest f = g + h: ${cost(g)} + ${cost(h)} = ${cost(g + h)}.`
        : `Took the frontier node with the lowest f = g + ${w} × h: ${cost(g)} + ${w} × ${cost(h)} = ${cost(g + weight * h)}.`,
  }[algorithm];

  const roads = describeRoads(algorithm, timeline.pushesAt[step]!, timeline.expandedDegree[step]!);
  return `${choice} ${roads}`;
}

export interface PartContext {
  timeline: Pick<
    Timeline,
    'entryNode' | 'entryCost' | 'entryEstimate' | 'entryPrevious' | 'expandedEntry' | 'pushesAt'
  >;
  step: number;
  algorithm: AlgorithmId;
  objective: Objective;
  weight: number;
  names: NodeLabels;
}

const BEST_FIRST: readonly AlgorithmId[] = ['dijkstra', 'astar'];

/** One part of a step, in words: what the highlighted pseudocode lines just did. */
export function describePart(part: StepPart, context: PartContext): string {
  const { timeline: t, step, algorithm, objective, weight, names } = context;
  const cost = (value: number) => formatCost(value, objective);
  const name = (entry: number) => labelOf(names, t.entryNode[entry]!);
  const w = Math.round(weight * 10) / 10;
  // g + h written out with its total, weighting h for weighted A*.
  const sum = (g: number, h: number) =>
    weight === 1
      ? `${cost(g)} + ${cost(h)} = ${cost(g + h)}`
      : `${cost(g)} + ${w} × ${cost(h)} = ${cost(g + weight * h)}`;

  switch (part.kind) {
    case 'take': {
      const g = t.entryCost[part.entry]!;
      const h = t.entryEstimate[part.entry]!;
      const why = {
        bfs: 'the oldest node in the queue.',
        dfs: 'the newest node on the stack.',
        greedy: `the frontier node that looks closest to B (estimate ${cost(h)}).`,
        dijkstra: `the frontier node with the lowest cost so far, ${cost(g)}.`,
        astar:
          weight === 1
            ? `the frontier node with the lowest f = g + h: ${sum(g, h)}.`
            : `the frontier node with the lowest f = g + ${w} × h: ${sum(g, h)}.`,
      }[algorithm];
      return `Took ${name(part.entry)}, ${why}`;
    }
    case 'skip':
      return algorithm === 'dfs'
        ? `Took an entry for ${name(part.entry)}, but it was already expanded. Skipped it.`
        : `Took an entry for ${name(part.entry)}, but it is outdated: a cheaper way there was found later. Skipped it.`;
    case 'goal':
      return `${name(t.expandedEntry[step]!)} is B. The search stops and follows the roads it came by back to A.`;
    case 'road': {
      const to = name(part.entry);
      if (algorithm === 'bfs') return `Road to ${to}: not seen before, so it joins the queue.`;
      if (algorithm === 'dfs') return `Road to ${to}: not expanded yet, so it goes on the stack.`;
      const g = t.entryCost[part.entry]!;
      const h = t.entryEstimate[part.entry]!;
      if (algorithm === 'greedy') {
        return `Road to ${to}: not seen before, so it joins the frontier with h = ${cost(h)}.`;
      }
      const from = t.entryCost[t.expandedEntry[step]!]!;
      // Many street segments take a few seconds; whole seconds would round them to nothing.
      const c = g - from;
      const road = objective === 'fastest' && c < 10 ? `${c.toFixed(1)} s` : cost(c);
      const length = objective === 'fastest' ? `taking ${road}` : `${road} long`;
      const previous = t.entryPrevious[part.entry]!;
      const verdict = Number.isFinite(previous)
        ? `beats the best known way there, ${cost(previous)}`
        : 'is the first way found there';
      const joins = algorithm === 'dijkstra' ? `g = ${cost(g)}` : `f = ${sum(g, h)}`;
      return `Road to ${to}, ${length}: ${cost(from)} + ${road} = ${cost(g)} ${verdict}, so it joins the frontier with ${joins}.`;
    }
    case 'rejected': {
      const others = t.pushesAt[step]! > 0;
      const subject =
        part.count === 1
          ? others
            ? 'The other road'
            : 'Its only road'
          : `${others ? 'The other' : 'Its'} ${part.count} roads`;
      const outcome = BEST_FIRST.includes(algorithm)
        ? 'did not reach anywhere more cheaply'
        : algorithm === 'dfs'
          ? 'led somewhere already expanded'
          : 'led somewhere already seen';
      return `${subject} ${outcome}.`;
    }
  }
}
