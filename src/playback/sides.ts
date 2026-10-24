import { meetingAt, type Timeline } from './timeline';

/** How far into the leave order to look for a side's next entry; bounds the work per frame. */
const SCAN_LIMIT = 100_000;

type Entries = Pick<
  Timeline,
  'entryCount' | 'entryEnter' | 'entrySide' | 'leaveOrder' | 'leftBy' | 'entryPriority'
>;

/**
 * The entry each side of a bidirectional search would take out next after `step`, or -1 if its
 * frontier is empty. Like the search itself, this counts outdated entries still waiting.
 */
export function sideNext(t: Entries, step: number): [number, number] {
  const next: [number, number] = [-1, -1];
  const end = Math.min(t.entryCount, t.leftBy[step]! + SCAN_LIMIT);
  for (let i = t.leftBy[step]!; i < end && (next[0] < 0 || next[1] < 0); i++) {
    const entry = t.leaveOrder[i]!;
    // Entries pushed later can leave first; they are not waiting yet.
    if (t.entryEnter[entry]! > step) continue;
    const side = t.entrySide[entry]!;
    if (next[side]! < 0) next[side] = entry;
  }
  return next;
}

export interface StopCheck {
  /** The priority of each side's next entry; Infinity when a side has run out. */
  next: [number, number];
  sum: number;
  /** The best route found so far, in what the search minimises; Infinity before they meet. */
  best: number;
  /** Nothing left can beat the best route: the search stops here. */
  canStop: boolean;
}

/** The bidirectional stop rule after `step`: stop once the next priorities add up to the best. */
export function stopCheck(
  t: Entries & Pick<Timeline, 'meetCount' | 'meetStep' | 'meetLength'>,
  step: number,
): StopCheck {
  const next = sideNext(t, step).map((entry) =>
    entry < 0 ? Infinity : t.entryPriority[entry]!,
  ) as [number, number];
  const meeting = meetingAt(t, step);
  const best = meeting < 0 ? Infinity : t.meetLength[meeting]!;
  const sum = next[0] + next[1];
  return { next, sum, best, canStop: sum >= best };
}

/** A meeting's route cost, split at the meeting point into the part from A and the part to B. */
export function meetingSplit(
  t: Pick<Timeline, 'meetEntry' | 'meetCost' | 'entryCost' | 'entrySide'>,
  meeting: number,
) {
  const entry = t.meetEntry[meeting]!;
  const total = t.meetCost[meeting]!;
  const cost = t.entryCost[entry]!;
  const fromA = t.entrySide[entry] === 0 ? cost : total - cost;
  return { fromA, toB: total - fromA };
}

export interface ClimbStopCheck {
  /** Each side's next entry worth taking, or -1 if it has none; outdated entries don't count. */
  entries: [number, number];
  /** Their costs; Infinity when a side has run out. */
  next: [number, number];
  /** The best route found so far; Infinity before the sides meet. */
  best: number;
  /** Neither side can beat the best route any more: the search stops here. */
  canStop: boolean;
}

/**
 * Contraction hierarchies' stop rule after `step`. Each side only climbs, so a cheaper meeting
 * can lie beyond either side's frontier: it stops once each side's cheapest node waiting costs
 * at least the best route, rather than once the two add up to it.
 */
export function climbStopCheck(
  t: Entries & Pick<Timeline, 'entryStale' | 'entryCost' | 'meetCount' | 'meetStep' | 'meetLength'>,
  step: number,
): ClimbStopCheck {
  const entries: [number, number] = [-1, -1];
  const end = Math.min(t.entryCount, t.leftBy[step]! + SCAN_LIMIT);
  for (let i = t.leftBy[step]!; i < end && (entries[0] < 0 || entries[1] < 0); i++) {
    const entry = t.leaveOrder[i]!;
    if (t.entryEnter[entry]! > step || t.entryStale[entry]! <= step) continue;
    const side = t.entrySide[entry]!;
    if (entries[side]! < 0) entries[side] = entry;
  }
  const next = entries.map((e) => (e < 0 ? Infinity : t.entryCost[e]!)) as [number, number];
  const meeting = meetingAt(t, step);
  const best = meeting < 0 ? Infinity : t.meetLength[meeting]!;
  return { entries, next, best, canStop: Math.min(...next) >= best };
}
