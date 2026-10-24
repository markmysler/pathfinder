import { grid, hopsVsCost } from '../test/fixtures';
import { bellmanFord } from './bellmanFord';
import { bfs } from './bfs';
import type { SearchEvent } from './types';
import { runSearch, summarize } from './trace';

describe('runSearch', () => {
  it('collects every event and the final result', () => {
    const trace = runSearch(bfs, { graph: hopsVsCost(), source: 0, target: 3 });
    expect(trace.events.length).toBeGreaterThan(0);
    expect(trace.result).toEqual({ found: true, path: [0, 3], edges: [0], cost: 10 });
    expect(trace.stopped).toBeUndefined();
  });

  it('stops recording after a number of steps, but still counts how many the search needed', () => {
    const problem = { graph: grid(6), source: 0, target: 35 };
    const full = runSearch(bellmanFord, problem);
    const steps = summarize(full.events).expanded;
    const cut = runSearch(bellmanFord, problem, { maxSteps: 10 });
    expect(summarize(cut.events).expanded).toBe(10);
    expect(cut.events).toEqual(full.events.slice(0, cut.events.length));
    // The cut ends where the eleventh step would begin.
    const next = full.events[cut.events.length]!;
    expect(next.type === 'pop' || next.type === 'skip').toBe(true);
    expect(cut.stopped).toEqual({ needed: steps });
    expect(cut.result).toEqual(full.result);
  });

  it('does not stop a search that fits in the limit', () => {
    const problem = { graph: grid(3), source: 0, target: 8 };
    expect(runSearch(bellmanFord, problem, { maxSteps: 1000 })).toEqual(
      runSearch(bellmanFord, problem),
    );
  });
});

describe('summarize', () => {
  it('counts expansions, pushes and the largest frontier', () => {
    const events: SearchEvent[] = [
      { type: 'push', node: 0, edge: null, cost: 0 },
      { type: 'pop', node: 0, cost: 0, entry: 0 },
      { type: 'push', node: 1, edge: 0, cost: 1 },
      { type: 'push', node: 2, edge: 1, cost: 1 },
      { type: 'push', node: 1, edge: 2, cost: 2 },
      { type: 'pop', node: 1, cost: 1, entry: 1 },
      { type: 'skip', node: 1, entry: 3 },
      { type: 'pop', node: 2, cost: 1, entry: 2 },
    ];
    expect(summarize(events)).toEqual({ expanded: 3, pushed: 4, maxFrontier: 3 });
  });

  it('counts both sides of a bidirectional search together, and not the meetings', () => {
    const events: SearchEvent[] = [
      { type: 'push', node: 0, edge: null, cost: 0, side: 'forward' },
      { type: 'push', node: 2, edge: null, cost: 0, side: 'backward' },
      { type: 'pop', node: 0, cost: 0, entry: 0, side: 'forward' },
      { type: 'push', node: 1, edge: 0, cost: 1, side: 'forward' },
      { type: 'pop', node: 2, cost: 0, entry: 1, side: 'backward' },
      { type: 'push', node: 1, edge: 1, cost: 1, side: 'backward' },
      { type: 'meet', node: 1, cost: 2, length: 2 },
      { type: 'push', node: 3, edge: 2, cost: 1, side: 'backward' },
    ];
    expect(summarize(events)).toEqual({ expanded: 2, pushed: 5, maxFrontier: 3 });
  });

  it('is all zeros for no events', () => {
    expect(summarize([])).toEqual({ expanded: 0, pushed: 0, maxFrontier: 0 });
  });
});
