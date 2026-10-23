import type { SearchAlgorithm, SearchEvent, SearchProblem, SearchResult } from './types';

export interface Trace {
  events: SearchEvent[];
  result: SearchResult;
}

/** Runs a search to the end, recording every event it emits. */
export function runSearch(search: SearchAlgorithm, problem: SearchProblem): Trace {
  const events: SearchEvent[] = [];
  const steps = search(problem);
  for (;;) {
    const step = steps.next();
    if (step.done) return { events, result: step.value };
    events.push(step.value);
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
