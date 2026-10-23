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

/** What a pushed neighbour means for each algorithm. */
const PUSH_MEANS: Record<AlgorithmId, string> = {
  bfs: 'led somewhere new',
  dfs: 'led somewhere not yet explored',
  greedy: 'led somewhere new',
  dijkstra: 'reached a neighbour more cheaply',
  astar: 'reached a neighbour more cheaply',
};

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

  const degree = timeline.expandedDegree[step]!;
  const pushes = timeline.pushesAt[step]!;
  if (degree === 0) return `${choice} It is a dead end.`;
  const roads = `${pushes} of ${degree} road${degree === 1 ? '' : 's'} ${PUSH_MEANS[algorithm]}.`;
  const joined =
    pushes === 0 ? '' : pushes === 1 ? ' It joined the frontier.' : ' They joined the frontier.';
  return `${choice} ${roads}${joined}`;
}
