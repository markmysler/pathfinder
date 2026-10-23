import { algorithms, oneWayOf as oneWay, type AlgorithmId } from '../algorithms';
import type { Objective } from '../osm/network';
import { labelOf, type NodeLabels } from '../osm/places';
import type { StepPart } from '../playback/frontier';
import { meetingSplit, sideNext, type StopCheck } from '../playback/sides';
import { meetingAt, type Timeline } from '../playback/timeline';
import { formatCost, formatCostsApart } from '../ui/format';

type NarratedTimeline = Pick<
  Timeline,
  'steps' | 'expandedCost' | 'expandedEstimate' | 'pushesAt' | 'expandedDegree' | 'route'
>;

type OneWayId = 'bfs' | 'dfs' | 'greedy' | 'dijkstra' | 'astar';

const oneWayOf = (algorithm: AlgorithmId) => oneWay(algorithm) as OneWayId;

const SIDE = ['A', 'B'] as const;

export type SearchStatus = 'searching' | 'found' | 'no-route';

export function searchStatus(
  timeline: Pick<Timeline, 'steps' | 'route'>,
  position: number,
): SearchStatus {
  if (position < timeline.steps) return 'searching';
  return timeline.route ? 'found' : 'no-route';
}

/** How to say what pushing a neighbour means for each algorithm: some, none, or not via the only road. */
const ROADS: Record<OneWayId, { some: string; none: string; onlyNot: string }> = {
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
  const phrases = ROADS[oneWayOf(algorithm)];
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
  if (algorithms[algorithm].bidirectional) {
    return describeBothWaysStep(timeline as Timeline, step, algorithm, objective);
  }
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
  }[oneWayOf(algorithm)];

  const roads = describeRoads(algorithm, timeline.pushesAt[step]!, timeline.expandedDegree[step]!);
  return `${choice} ${roads}`;
}

/** What a step's roads led to, in words, like "2 of 3 roads led somewhere new." */
export const describeStepRoads = (
  t: Pick<Timeline, 'pushesAt' | 'expandedDegree'>,
  step: number,
  algorithm: AlgorithmId,
) => describeRoads(algorithm, t.pushesAt[step]!, t.expandedDegree[step]!);

/** How a bidirectional search measures what it minimises: roads for BFS, cost otherwise. */
function measure(algorithm: AlgorithmId, objective: Objective) {
  return oneWayOf(algorithm) === 'bfs'
    ? (value: number) => `${value} ${value === 1 ? 'road' : 'roads'}`
    : (value: number) => formatCost(value, objective);
}

/** Which side a bidirectional search's step came from, as 0 (from A) or 1 (from B). */
const sideOfStep = (t: Pick<Timeline, 'expandedSide'>, step: number) => t.expandedSide[step]!;

function describeBothWaysStep(
  t: Timeline,
  step: number,
  algorithm: AlgorithmId,
  objective: Objective,
): string {
  if (step <= 0) return 'Start: A is in the frontier from A, and B in the frontier from B.';
  if (step >= t.steps) {
    if (!t.route) {
      return 'A side ran out of roads without meeting the other: there is no route to B.';
    }
    const length =
      objective === 'fastest'
        ? `takes ${formatCost(t.route.cost, objective)}`
        : `is ${formatCost(t.route.cost, objective)} long`;
    return `The sides met and nothing cheaper is left. The route ${length}.`;
  }
  const side = SIDE[sideOfStep(t, step)];
  const value = t.entryPriority[t.expandedEntry[step]!]!;
  const which = {
    bfs: `the node fewest roads from ${side} (${value})`,
    dijkstra: `the node nearest ${side} (${formatCost(value, objective)})`,
    astar: `the node with the lowest priority (${formatCost(value, objective)})`,
  }[oneWayOf(algorithm) as 'bfs' | 'dijkstra' | 'astar'];
  const roads = describeRoads(algorithm, t.pushesAt[step]!, t.expandedDegree[step]!);
  const meeting = meetingAt(t, step);
  const best = (i: number) => formatCost(t.meetCost[i]!, objective);
  const status =
    meeting < 0
      ? ''
      : t.meetStep[meeting] === step
        ? ` The sides meet: a route of ${best(meeting)}, the best so far.`
        : ` Best route so far: ${best(meeting)}. Still checking for a cheaper one.`;
  return `From ${side}: took ${which}. ${roads}${status}`;
}

/** Why the side that took a bidirectional search's step went next. */
export function describeTurn(
  t: Timeline,
  step: number,
  algorithm: AlgorithmId,
  objective: Objective,
  names: NodeLabels,
): string {
  const taken = t.expandedEntry[step]!;
  const mine = sideOfStep(t, step);
  const [me, other] = [SIDE[mine], SIDE[1 - mine]];
  const name = labelOf(names, t.entryNode[taken]!);
  const next = sideNext(t, step - 1);
  const theirs = next[1 - mine]!;
  if (theirs < 0) return `${other}'s frontier is empty, so ${me} took ${name}.`;
  const [value, otherValue] = apart(
    [t.entryPriority[taken]!, t.entryPriority[theirs]!],
    algorithm,
    objective,
  ) as [string, string];
  if (t.entryPriority[theirs] === t.entryPriority[taken]) {
    return oneWayOf(algorithm) === 'astar'
      ? `Both sides' next priorities were ${value}. A goes first on a tie, so it took ${name}.`
      : `Both sides' next nodes were ${oneWayOf(algorithm) === 'bfs' ? `${value} roads` : value} from their ends. A goes first on a tie, so it took ${name}.`;
  }
  const comparison = {
    bfs: `was fewer roads from ${me} (${value}) than ${other}'s next was from ${other} (${otherValue})`,
    dijkstra: `was nearer to ${me} (${value}) than ${other}'s next was to ${other} (${otherValue})`,
    astar: `had a lower priority (${value}) than ${other}'s next (${otherValue})`,
  }[oneWayOf(algorithm) as 'bfs' | 'dijkstra' | 'astar'];
  return `${me}'s next node, ${name}, ${comparison}, so ${me} took this step.`;
}

/** Values to compare, in what the search minimises, never two different ones reading the same. */
export function apart(values: readonly number[], algorithm: AlgorithmId, objective: Objective) {
  return oneWayOf(algorithm) === 'bfs' ? values.map(String) : formatCostsApart(values, objective);
}

/** Whether a bidirectional search can stop yet, in words. */
export function describeStopCheck(
  check: StopCheck,
  algorithm: AlgorithmId,
  objective: Objective,
): string {
  const show = measure(algorithm, objective);
  if (check.canStop) {
    return Number.isFinite(check.best)
      ? `Yes. Nothing left can beat ${show(check.best)}: the route is final.`
      : 'Yes: a side ran out of roads without meeting the other, so there is no route.';
  }
  if (!Number.isFinite(check.best)) {
    return 'Not yet: the sides have not met, so there is no route to beat.';
  }
  const [sum, best] = apart([check.sum, check.best], algorithm, objective);
  if (oneWayOf(algorithm) === 'astar') {
    return `Not quite. The next priorities add up to ${sum}, under the best route, ${best}, so something cheaper could still turn up.`;
  }
  const roads = oneWayOf(algorithm) === 'bfs' ? ' roads' : '';
  const verb = roads ? 'take' : 'cost';
  return `Not quite. A route through roads neither side has explored yet would ${verb} at least ${sum}${roads}, which could still beat ${best}${roads}.`;
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
  if (algorithms[context.algorithm].bidirectional) return describeBothWaysPart(part, context);
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
      }[oneWayOf(algorithm)];
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
    // Only searches from both ends meet, or stop by comparing their two sides.
    case 'meet':
    case 'stop':
      return '';
  }
}

function describeBothWaysPart(part: StepPart, context: PartContext): string {
  const { step, algorithm, objective, names } = context;
  const t = context.timeline as Timeline;
  const cost = (value: number) => formatCost(value, objective);
  const name = (entry: number) => labelOf(names, t.entryNode[entry]!);
  const bfs = oneWayOf(algorithm) === 'bfs';
  const side = (entry: number) => SIDE[t.entrySide[entry]!];
  const toEnd = (entry: number) => (t.entrySide[entry] ? 'to B' : 'from A');

  switch (part.kind) {
    case 'take':
      return describeTurn(t, step, algorithm, objective, names);
    case 'skip':
      return `Took an entry for ${name(part.entry)} from ${side(part.entry)}'s frontier, but it is outdated: a cheaper way there was found later. Skipped it.`;
    case 'road': {
      const entry = part.entry;
      const backward = t.entrySide[entry] === 1;
      const road = `Road ${backward ? 'from' : 'to'} ${name(entry)}`;
      if (bfs) {
        const roads = t.entryPriority[entry]!;
        return `${road}: not seen by ${side(entry)}'s side before, so it joins ${side(entry)}'s queue, ${roads} ${roads === 1 ? 'road' : 'roads'} ${toEnd(entry)}.`;
      }
      const g = t.entryCost[entry]!;
      const from = t.entryCost[t.expandedEntry[step]!]!;
      const c = g - from;
      const length =
        objective === 'fastest'
          ? `taking ${c < 10 ? `${c.toFixed(1)} s` : cost(c)}`
          : `${cost(c)} long`;
      const roadCost = objective === 'fastest' && c < 10 ? `${c.toFixed(1)} s` : cost(c);
      const previous = t.entryPrevious[entry]!;
      const verdict = Number.isFinite(previous)
        ? `beats the best known way there, ${cost(previous)}`
        : 'is the first way found there';
      const joins =
        oneWayOf(algorithm) === 'astar'
          ? `priority g ${backward ? '−' : '+'} p = ${cost(t.entryPriority[entry]!)}`
          : `g = ${cost(g)}`;
      return `${road}, ${length}: ${cost(from)} + ${roadCost} = ${cost(g)} ${toEnd(entry)} ${verdict}, so it joins ${side(entry)}'s frontier with ${joins}.`;
    }
    case 'meet': {
      const entry = t.meetEntry[part.meeting]!;
      const other = SIDE[1 - t.entrySide[entry]!];
      const otherEnd = t.entrySide[entry] ? 'from A' : 'to B';
      if (bfs) {
        const mine = t.entryPriority[entry]!;
        const total = t.meetLength[part.meeting]!;
        const theirs = total - mine;
        return `${other} had already reached ${name(entry)}, ${theirs} ${theirs === 1 ? 'road' : 'roads'} ${otherEnd}, so the sides meet: ${mine} + ${theirs} = ${total} roads, the fewest so far.`;
      }
      const { fromA, toB } = meetingSplit(t, part.meeting);
      const theirs = t.entrySide[entry] ? fromA : toB;
      return `${other} had already reached ${name(entry)}, ${cost(theirs)} ${otherEnd}, so the sides meet: ${cost(fromA)} + ${cost(toB)} = ${cost(fromA + toB)}, the best route so far.`;
    }
    case 'stop': {
      const next = sideNext(t, step).map((e) => (e < 0 ? Infinity : t.entryPriority[e]!));
      const meeting = meetingAt(t, step);
      if (meeting < 0 || !t.route) {
        return 'A side ran out of roads without meeting the other, so the search stops: there is no route.';
      }
      const label =
        oneWayOf(algorithm) === 'astar' ? 'Next priorities' : 'Next from A + next from B';
      const [a, b, sum, best] = apart(
        [next[0]!, next[1]!, next[0]! + next[1]!, t.meetLength[meeting]!],
        algorithm,
        objective,
      );
      const roads = oneWayOf(algorithm) === 'bfs' ? ' roads' : '';
      return `${label}: ${a} + ${b} = ${sum}${roads}, no less than the best route, ${best}${roads}. Nothing left can beat it, so the search stops.`;
    }
    case 'rejected': {
      const others = t.pushesAt[step]! > 0;
      const subject =
        part.count === 1
          ? others
            ? 'The other road'
            : 'Its only road'
          : `${others ? 'The other' : 'Its'} ${part.count} roads`;
      return `${subject} ${bfs ? 'led somewhere this side had already seen' : 'did not reach anywhere more cheaply'}.`;
    }
    case 'goal':
      return '';
  }
}
