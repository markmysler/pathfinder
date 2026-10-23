import type { Timeline } from './timeline';

type Entries = Pick<
  Timeline,
  | 'steps'
  | 'entryCount'
  | 'entryEnter'
  | 'entryStale'
  | 'leaveOrder'
  | 'leftBy'
  | 'outdatedAt'
  | 'frontierSizeAt'
>;

/** How far past the waiting entries to look for ones pushed later; bounds the work per frame. */
const SCAN_LIMIT = 100_000;

/**
 * The frontier after a step: up to `limit` waiting entries, in the order the search will take
 * them, plus how many nodes are waiting and how many entries are outdated.
 */
export function frontierAt(timeline: Entries, step: number, limit: number) {
  const entries: number[] = [];
  const end = Math.min(timeline.entryCount, timeline.leftBy[step]! + SCAN_LIMIT);
  for (let i = timeline.leftBy[step]!; i < end && entries.length < limit; i++) {
    const entry = timeline.leaveOrder[i]!;
    // Entries pushed later can leave first (a stack, or a cheaper entry); they are not here yet.
    if (timeline.entryEnter[entry]! <= step && timeline.entryStale[entry]! > step) {
      entries.push(entry);
    }
  }
  return {
    entries,
    waiting: timeline.frontierSizeAt[step]!,
    outdated: timeline.outdatedAt[step]!,
  };
}

/** One thing a step did, in order: what the pseudocode highlights line by line. */
export type StepPart =
  /** An outdated entry was thrown away. */
  | { kind: 'skip'; entry: number }
  /** The entry the step expanded. */
  | { kind: 'take'; entry: number }
  /** The node taken was B: the search stops. */
  | { kind: 'goal' }
  /** A road that led somewhere better: its end joined the frontier as `entry`. */
  | { kind: 'road'; entry: number }
  /** Roads that led nowhere better. */
  | { kind: 'rejected'; count: number };

type Steps = Entries &
  Pick<Timeline, 'expandedEntry' | 'expandedDegree' | 'pushesAt' | 'entryLeave' | 'route'>;

/** First entry pushed after `step`; entries are numbered in push order, so enter never drops. */
function enteredAfter(timeline: Pick<Timeline, 'entryEnter' | 'entryCount'>, step: number) {
  let low = 0;
  let high = timeline.entryCount;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (timeline.entryEnter[mid]! <= step) low = mid + 1;
    else high = mid;
  }
  return low;
}

export function partsOfStep(timeline: Steps, step: number): StepPart[] {
  if (step < 1 || step > timeline.steps) return [];
  const parts: StepPart[] = [];
  const taken = timeline.expandedEntry[step]!;
  for (let i = timeline.leftBy[step - 1]!; i < timeline.leftBy[step]!; i++) {
    const entry = timeline.leaveOrder[i]!;
    if (entry !== taken) parts.push({ kind: 'skip', entry });
  }
  parts.push({ kind: 'take', entry: taken });
  if (step === timeline.steps && timeline.route) {
    parts.push({ kind: 'goal' });
    return parts;
  }
  for (
    let entry = enteredAfter(timeline, step - 1);
    entry < enteredAfter(timeline, step);
    entry++
  ) {
    parts.push({ kind: 'road', entry });
  }
  const rejected = timeline.expandedDegree[step]! - timeline.pushesAt[step]!;
  if (rejected > 0) parts.push({ kind: 'rejected', count: rejected });
  return parts;
}
