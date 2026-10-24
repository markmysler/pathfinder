import type { SearchAlgorithm, SearchEvent, SearchProblem, SearchResult } from './types';

export interface Trace {
  events: SearchEvent[];
  result: SearchResult;
  /** Set when recording stopped at `maxSteps`: how many steps the whole search took. */
  stopped?: { needed: number };
}

/**
 * Runs a search to the end, recording every event it emits, or only those of its first
 * `maxSteps` expansions. Past that it still runs, to count the steps and find the result.
 */
export function runSearch(
  search: SearchAlgorithm,
  problem: SearchProblem,
  { maxSteps = Infinity }: { maxSteps?: number } = {},
): Trace {
  const events: SearchEvent[] = [];
  const steps = search(problem);
  let expanded = 0;
  let recording = true;
  for (;;) {
    const step = steps.next();
    if (step.done) {
      const trace: Trace = { events, result: step.value };
      if (!recording) trace.stopped = { needed: expanded };
      return trace;
    }
    const event = step.value;
    // A step begins with the skips before its expansion; the limit cuts before the next one.
    if (expanded >= maxSteps && (event.type === 'pop' || event.type === 'skip')) recording = false;
    if (event.type === 'pop') expanded++;
    if (recording) events.push(event);
  }
}

export interface SearchStats {
  /** Nodes taken out of the frontier and expanded. */
  expanded: number;
  /** Entries put into the frontier. */
  pushed: number;
  /** Largest number of entries in the frontier at once. */
  maxFrontier: number;
}

export function summarize(events: readonly SearchEvent[]): SearchStats {
  const stats = { expanded: 0, pushed: 0, maxFrontier: 0 };
  let frontier = 0;
  for (const event of events) {
    if (event.type === 'push') {
      stats.pushed++;
      stats.maxFrontier = Math.max(stats.maxFrontier, ++frontier);
    } else if (event.type !== 'meet') {
      frontier--;
      if (event.type === 'pop') stats.expanded++;
    }
  }
  return stats;
}
