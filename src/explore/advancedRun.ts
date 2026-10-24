import { algorithms, type AlgorithmId, type AlgorithmInfo, type Preparation } from '../algorithms';
import type { AdvancedView } from '../map/explorationLayers';
import { labelOf, type NodeLabels } from '../osm/places';
import { formatCost } from '../ui/format';
import { bellmanFordRounds, type Rounds } from '../playback/rounds';
import type { Timeline } from '../playback/timeline';
import type { AlgorithmRun, PreparationView } from '../worker/job';
import type { RunView } from './Inspector';

// Worked out once per timeline, and shared by the map, the inspector and the playback bar.
const roundsCache = new WeakMap<Timeline, Rounds>();

/** Bellman-Ford's rounds for a run; null for every other algorithm. */
export function roundsOf(run: Pick<RunView, 'algorithm' | 'timeline' | 'target'>): Rounds | null {
  if (run.algorithm !== 'bellmanford') return null;
  let rounds = roundsCache.get(run.timeline);
  if (!rounds) {
    rounds = bellmanFordRounds(run.timeline, run.target ?? -1);
    roundsCache.set(run.timeline, rounds);
  }
  return rounds;
}

/** The same, under a hook's name for components. */
export const useRounds = roundsOf;

/** What the chosen algorithms prepare before searching. */
export const preparationsOf = (chosen: readonly AlgorithmId[]): Preparation[] => [
  ...new Set(chosen.flatMap((id) => (algorithms[id] as AlgorithmInfo).prepares ?? [])),
];

/** What an advanced algorithm adds to the map of its search, if anything. */
export function advancedView(
  run: AlgorithmRun,
  preparation: PreparationView,
  target: number,
  /** Watching ALT's landmarks being prepared: none is picked out yet. */
  preparing = false,
): AdvancedView | undefined {
  switch (run.algorithm) {
    case 'bellmanford':
      return { kind: 'rounds', rounds: roundsOf({ ...run, target })! };
    case 'alt':
      return preparation.landmarks
        ? {
            kind: 'landmarks',
            landmarks: preparation.landmarks,
            steps: preparing ? undefined : run.landmarkSteps,
          }
        : undefined;
    case 'ch':
      return preparation.hierarchy
        ? { kind: 'hierarchy', replay: preparation.hierarchy.replay }
        : undefined;
    default:
      return undefined;
  }
}

/** The inspector's heading for a step of Bellman-Ford. */
export function roundTitle(t: Timeline, rounds: Rounds, step: number) {
  if (step >= t.steps) {
    return t.stopped
      ? 'Stopped at the step limit'
      : 'Bellman-Ford finished: a round changed nothing';
  }
  if (step === 0) return 'Round 0: only A, at no cost';
  return `Round ${rounds.roundAt[step]}: checking roads out of nodes that just got cheaper`;
}

/**
 * Where Bellman-Ford's round buttons go from `step`: forward to the start of the next round,
 * back to the start of this one, or of the one before when already there.
 */
export function roundJump(rounds: Rounds, step: number, direction: 1 | -1, total: number) {
  const round = rounds.roundAt[step]!;
  if (direction > 0) {
    return step === 0
      ? Math.min(total, rounds.startOf(0))
      : Math.min(total, rounds.startOf(round + 1));
  }
  const start = step === 0 ? 0 : rounds.startOf(round);
  if (step > start) return start;
  return round === 0 ? 0 : rounds.startOf(round - 1);
}

/**
 * The phone sheet's one line, where an advanced algorithm has more to say than its step: what
 * contraction did, a correction, or where ALT's estimate came from. Null to narrate the step.
 */
export function advancedLine(
  run: RunView,
  step: number,
  names: NodeLabels,
  part: 'prepare' | 'search',
): string | null {
  const { timeline: t, objective, preparation } = run;
  const cost = (v: number) => formatCost(v, objective);
  if (part === 'prepare') {
    const hierarchy = run.algorithm === 'ch' ? preparation?.hierarchy : undefined;
    if (hierarchy) {
      const { replay } = hierarchy;
      if (step === 0) {
        return 'Contraction takes the nodes out one at a time, least important first.';
      }
      const i = step - 1;
      const ways = replay.ways[i]!;
      const first = replay.shortcutsBy[i]!;
      const needed = replay.shortcutsBy[step]! - first;
      const name = labelOf(names, replay.node[i]!);
      if (ways === 0) return `${name}: no way runs through it, so it goes without a shortcut.`;
      const quicker = objective === 'fastest' ? 'quicker' : 'shorter';
      const verdict = `${name}: ${ways} ${ways === 1 ? 'way' : 'ways'} through it, ${ways - needed} ${ways - needed === 1 ? 'has' : 'have'} a ${quicker} way round, ${needed} ${needed === 1 ? 'needs a shortcut' : 'need shortcuts'}.`;
      return needed ? `${verdict} New shortcut, ${cost(replay.shortcutWeight[first]!)}.` : verdict;
    }
    const landmarks = preparation?.landmarks;
    return landmarks
      ? `${landmarks.node.length} landmarks, chosen farthest first, around the edge of the map. Times to and from each were measured for every node.`
      : null;
  }
  if (step <= 0 || step >= t.steps) return null;
  const rounds = roundsOf(run);
  if (rounds) {
    const previous = rounds.previousExpansion[step]!;
    if (!previous) return null;
    const better = objective === 'fastest' ? 'quicker' : 'shorter';
    return `Corrected: ${labelOf(names, t.expandedNode[step]!)} got ${better}, ${cost(t.expandedCost[previous]!)} → ${cost(t.expandedCost[step]!)}, so its roads are checked again. It can't stop at B until a round changes nothing.`;
  }
  const steps = run.landmarkSteps;
  if (steps && steps.best[step]! >= 0) {
    const where = steps.via[step] ? 'behind this node' : 'beyond B';
    return `Landmark ${steps.best[step]! + 1}, ${where}, gives the estimate: ${cost(steps.first[step]!)} − ${cost(steps.second[step]!)} = ${cost(t.expandedEstimate[step]!)} · straight line: ${cost(steps.straight[step]!)}`;
  }
  return null;
}
