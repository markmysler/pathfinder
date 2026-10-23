import { meetingAt, type Timeline } from './timeline';

type Entries = Pick<
  Timeline,
  | 'steps'
  | 'entryCount'
  | 'entryEnter'
  | 'entryStale'
  | 'leaveOrder'
  | 'leftBy'
  | 'outdatedAt'
  | 'outdatedAtB'
  | 'frontierSizeAt'
  | 'frontierSizeAtB'
  | 'entrySide'
>;

/** How far past the waiting entries to look for ones pushed later; bounds the work per frame. */
const SCAN_LIMIT = 100_000;

/**
 * The frontier after a step: up to `limit` waiting entries, in the order the search will take
 * them, plus how many nodes are waiting and how many entries are outdated. For a bidirectional
 * search, `side` (0 from A, 1 from B) keeps to one side's frontier.
 */
export function frontierAt(timeline: Entries, step: number, limit: number, side?: number) {
  const entries: number[] = [];
  const end = Math.min(timeline.entryCount, timeline.leftBy[step]! + SCAN_LIMIT);
  for (let i = timeline.leftBy[step]!; i < end && entries.length < limit; i++) {
    const entry = timeline.leaveOrder[i]!;
    if (side !== undefined && timeline.entrySide[entry] !== side) continue;
    // Entries pushed later can leave first (a stack, or a cheaper entry); they are not here yet.
    if (timeline.entryEnter[entry]! <= step && timeline.entryStale[entry]! > step) {
      entries.push(entry);
    }
  }
  const count = (all: Uint32Array, onB: Uint32Array) =>
    side === undefined ? all[step]! : side ? onB[step]! : all[step]! - onB[step]!;
  return {
    entries,
    waiting: count(timeline.frontierSizeAt, timeline.frontierSizeAtB),
    outdated: count(timeline.outdatedAt, timeline.outdatedAtB),
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
  /** That road's end was already reached by the other side, making a cheaper route. */
  | { kind: 'meet'; meeting: number }
  /** Roads that led nowhere better. */
  | { kind: 'rejected'; count: number }
  /** Bidirectional: the next priorities add up to at least the best route, so it is final. */
  | { kind: 'stop' };

type Steps = Entries &
  Pick<
    Timeline,
    | 'expandedEntry'
    | 'expandedDegree'
    | 'pushesAt'
    | 'entryLeave'
    | 'route'
    | 'bidirectional'
    | 'meetCount'
    | 'meetStep'
    | 'meetEntry'
  >;

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
  if (step === timeline.steps && timeline.route && !timeline.bidirectional) {
    parts.push({ kind: 'goal' });
    return parts;
  }
  let meeting = meetingAt(timeline, step - 1) + 1;
  for (
    let entry = enteredAfter(timeline, step - 1);
    entry < enteredAfter(timeline, step);
    entry++
  ) {
    parts.push({ kind: 'road', entry });
    for (; meeting < timeline.meetCount && timeline.meetEntry[meeting] === entry; meeting++) {
      parts.push({ kind: 'meet', meeting });
    }
  }
  const rejected = timeline.expandedDegree[step]! - timeline.pushesAt[step]!;
  if (rejected > 0) parts.push({ kind: 'rejected', count: rejected });
  if (step === timeline.steps && timeline.bidirectional) parts.push({ kind: 'stop' });
  return parts;
}
