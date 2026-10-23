import type { AlgorithmId } from '../algorithms';
import type { Timeline } from '../playback/timeline';
import { searchStatus, type SearchStatus } from './narration';

type ComparedRun = {
  algorithm: AlgorithmId;
  timeline: Pick<Timeline, 'steps' | 'frontierPeakAt' | 'route'>;
};

export interface ComparisonRow {
  algorithm: AlgorithmId;
  status: SearchStatus;
  /** Nodes expanded by now: the shared step, or where the search ended if earlier. */
  expanded: number;
  peakFrontier: number;
  /** Known once the search has reached B. */
  route: { cost: number; meters: number } | null;
  /** How much costlier the route is than the cheapest found so far: 0.2 means 20 % worse. */
  overBest: number | null;
  /** Has the cheapest route found so far (ties all count). */
  best: boolean;
  /** Reached B after the fewest expansions. Final once shown: searches still running have more. */
  fewest: boolean;
}

/** One clock drives every map, so it runs until the longest search has finished. */
export const totalSteps = (runs: readonly ComparedRun[]) =>
  Math.max(0, ...runs.map((run) => run.timeline.steps));

const TIE = 1e-9;

/** Where each search stands at a step of the shared clock, for the results table. */
export function compareRuns(runs: readonly ComparedRun[], step: number): ComparisonRow[] {
  const rows = runs.map(({ algorithm, timeline }) => {
    const status = searchStatus(timeline, step);
    const expanded = Math.min(step, timeline.steps);
    const route =
      status === 'found' && timeline.route
        ? { cost: timeline.route.cost, meters: timeline.route.meters }
        : null;
    return { algorithm, status, expanded, peakFrontier: timeline.frontierPeakAt[expanded]!, route };
  });

  const found = rows.filter((row) => row.route);
  const cheapest = Math.min(...found.map((row) => row.route!.cost));
  const fewest = Math.min(...found.map((row) => row.expanded));
  return rows.map((row) => {
    if (!row.route) return { ...row, overBest: null, best: false, fewest: false };
    const overBest = cheapest > 0 ? (row.route.cost - cheapest) / cheapest : 0;
    return {
      ...row,
      overBest: overBest < TIE ? 0 : overBest,
      best: overBest < TIE,
      fewest: runs.length > 1 && row.expanded === fewest,
    };
  });
}

/** Searches that finish before the shared clock ends, and the step where each does. */
export const finishMarks = (runs: readonly ComparedRun[]) => {
  const total = totalSteps(runs);
  return runs
    .filter((run) => run.timeline.steps < total)
    .map((run) => ({ algorithm: run.algorithm, step: run.timeline.steps }));
};
