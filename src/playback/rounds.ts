import type { Timeline } from './timeline';

type RoundsTimeline = Pick<
  Timeline,
  | 'steps'
  | 'expandedNode'
  | 'expandedEntry'
  | 'entryCount'
  | 'entryNode'
  | 'entryEnter'
  | 'entryCost'
  | 'entryPriority'
>;

/** Bellman-Ford's search seen round by round, as its inspector and playback show it. */
export interface Rounds {
  /** Each step's round, by step; 0 for the start. */
  roundAt: Uint32Array;
  /** How many rounds there are. */
  count: number;
  /** The step each round starts at. */
  firstStep: Uint32Array;
  /** The first step of round `round`, or the last step if there is no such round. */
  startOf(round: number): number;
  /** For a step that expands a node again: the step that expanded it last. 0 otherwise. */
  previousExpansion: Uint32Array;
  /** Different nodes expanded by each step; the rest of the steps were corrections. */
  distinctBy: Uint32Array;
  /** The cheapest cost known for B after each step: Infinity until it is reached. */
  targetCostAt: Float64Array;
  /** How many times that cost went down after B was first reached, by each step. */
  targetImprovedBy: Uint32Array;
  /** When B was first reached, and at what cost; null if it never was. */
  targetFirst: { step: number; cost: number; round: number } | null;
}

/** Bellman-Ford's rounds: a push's priority is its round, one more than the step that made it. */
export function bellmanFordRounds(t: RoundsTimeline, target: number): Rounds {
  const { steps } = t;
  const roundAt = new Uint32Array(steps + 1);
  const firsts: number[] = [];
  const previousExpansion = new Uint32Array(steps + 1);
  const distinctBy = new Uint32Array(steps + 1);
  const lastExpanded = new Map<number, number>();
  for (let step = 1; step <= steps; step++) {
    const round = t.entryPriority[t.expandedEntry[step]!]!;
    roundAt[step] = round;
    while (firsts.length <= round) firsts.push(step);
    const node = t.expandedNode[step]!;
    const before = lastExpanded.get(node);
    previousExpansion[step] = before ?? 0;
    distinctBy[step] = distinctBy[step - 1]! + (before === undefined ? 1 : 0);
    lastExpanded.set(node, step);
  }
  const firstStep = Uint32Array.from(firsts);

  // Every push for B is a cheaper way there, so the cost known for B drops at each.
  const targetCostAt = new Float64Array(steps + 1).fill(Infinity);
  const targetImprovedBy = new Uint32Array(steps + 1);
  let targetFirst: Rounds['targetFirst'] = null;
  const drops = new Float64Array(steps + 2).fill(Infinity);
  const improved = new Uint32Array(steps + 2);
  for (let e = 0; e < t.entryCount; e++) {
    if (t.entryNode[e] !== target) continue;
    const at = t.entryEnter[e]!;
    drops[at] = Math.min(drops[at]!, t.entryCost[e]!);
    if (targetFirst) improved[at]!++;
    else targetFirst = { step: at, cost: t.entryCost[e]!, round: t.entryPriority[e]! };
  }
  for (let step = 0, cost = Infinity, count = 0; step <= steps; step++) {
    cost = Math.min(cost, drops[step]!);
    count += improved[step]!;
    targetCostAt[step] = cost;
    targetImprovedBy[step] = count;
  }

  return {
    roundAt,
    count: firstStep.length,
    firstStep,
    startOf: (round) => (round < firstStep.length ? firstStep[round]! : steps),
    previousExpansion,
    distinctBy,
    targetCostAt,
    targetImprovedBy,
    targetFirst,
  };
}
