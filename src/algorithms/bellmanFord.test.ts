import fc from 'fast-check';
import { randomGeoProblem } from '../test/arbitraries';
import { graphFrom, grid, hopsVsCost } from '../test/fixtures';
import { referenceDistances, referenceHops } from '../test/reference';
import { bellmanFord } from './bellmanFord';
import { dijkstra } from './dijkstra';
import { runSearch, summarize } from './trace';
import type { SearchEvent } from './types';

const brief = (events: SearchEvent[]) =>
  events.map((e) => (e.type === 'meet' ? `meet ${e.node}` : `${e.type} ${e.node}`));

describe('bellmanFord', () => {
  it('always finds the cheapest route', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source, target }) => {
        const { result } = runSearch(bellmanFord, { graph, source, target });
        if (result.found) {
          expect(result.cost).toBeCloseTo(referenceDistances(graph, source)[target]!, 6);
        }
      }),
    );
  });

  it('expands a node again when a cheaper way to it turns up later', () => {
    // 0 → 3 directly costs 10, but 0 → 1 → 2 → 3 costs 3 and is only found two rounds later.
    const { events, result } = runSearch(bellmanFord, {
      graph: hopsVsCost(),
      source: 0,
      target: 3,
    });
    expect(brief(events)).toEqual([
      'push 0',
      'pop 0',
      'push 3',
      'push 1',
      'pop 3',
      'pop 1',
      'push 2',
      'pop 2',
      'push 3',
      'pop 3',
    ]);
    const pops = events.filter((e) => e.type === 'pop');
    expect(pops.filter((e) => e.node === 3).map((e) => e.cost)).toEqual([10, 3]);
    expect(result).toEqual({ found: true, path: [0, 1, 2, 3], edges: [1, 2, 3], cost: 3 });
  });

  it('keeps going after reaching the target, until nothing improves', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source, target }) => {
        const expanded = new Set(
          runSearch(bellmanFord, { graph, source, target })
            .events.filter((e) => e.type === 'pop')
            .map((e) => e.node),
        );
        const reachable = referenceHops(graph, source).filter((hops) => hops < Infinity);
        expect(expanded.size).toBe(reachable.length);
      }),
    );
  });

  it('works in rounds: each push is one road further out than the node it came from', () => {
    const { events } = runSearch(bellmanFord, { graph: hopsVsCost(), source: 0, target: 3 });
    const pushes = events.filter((e) => e.type === 'push');
    expect(pushes.map((e) => [e.node, e.priority])).toEqual([
      [0, 0],
      [3, 1],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it('takes nodes in the order they joined the queue, so rounds never go backwards', () => {
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const { events } = runSearch(bellmanFord, problem);
        const taken = events.filter((e) => e.type === 'pop' || e.type === 'skip');
        taken.slice(1).forEach((e, i) => expect(e.entry).toBeGreaterThan(taken[i]!.entry));
      }),
    );
  });

  it('skips a queued entry that a cheaper one for the same node has replaced', () => {
    // From 0, node 1 is first reached for 6 (via 2), then for 2 (via 3), before either is taken.
    const graph = graphFrom([
      [0, 2, 1],
      [0, 3, 1],
      [2, 1, 5],
      [3, 1, 1],
    ]);
    const { events } = runSearch(bellmanFord, { graph, source: 0, target: 1 });
    expect(brief(events)).toEqual([
      'push 0',
      'pop 0',
      'push 2',
      'push 3',
      'pop 2',
      'push 1',
      'pop 3',
      'push 1',
      'skip 1',
      'pop 1',
    ]);
  });

  it('expands at least as often as Dijkstra, which never expands a node twice', () => {
    const graph = grid(6);
    const slow = summarize(runSearch(bellmanFord, { graph, source: 0, target: 35 }).events);
    const fast = summarize(runSearch(dijkstra, { graph, source: 0, target: 35 }).events);
    expect(slow.expanded).toBeGreaterThanOrEqual(fast.expanded);
  });
});
