import type { AlgorithmId } from '../algorithms';
import type { Objective } from '../osm/network';
import type { Timeline } from '../playback/timeline';
import { formatCost } from '../ui/format';

type NarratedTimeline = Pick<
  Timeline,
  'steps' | 'expandedCost' | 'expandedEstimate' | 'pushesAt' | 'expandedDegree' | 'route'
>;

export type SearchStatus = 'searching' | 'found' | 'no-route';

export function searchStatus(timeline: Pick<Timeline, 'steps' | 'route'>, position: number) {
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
  const h = timeline.expandedEstimate[step]!;
  const choice = {
    bfs: 'Took the oldest node in the queue.',
    dfs: 'Took the newest node on the stack.',
    greedy: `Took the frontier node that looks closest to B (estimate ${cost(h)}).`,
    dijkstra: `Took the frontier node with the lowest cost so far, ${cost(g)}.`,
    astar: `Took the frontier node with the lowest f = g + h: ${cost(g)} + ${cost(h)} = ${cost(g + h)}.`,
  }[algorithm];

  const roads = describeRoads(algorithm, timeline.pushesAt[step]!, timeline.expandedDegree[step]!);
  return `${choice} ${roads}`;
}
