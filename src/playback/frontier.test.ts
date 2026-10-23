import fc from 'fast-check';
import { algorithms, type AlgorithmInfo } from '../algorithms';
import { straightLineHeuristic } from '../algorithms/heuristics';
import { runSearch, type Trace } from '../algorithms/trace';
import { randomGeoProblem } from '../test/arbitraries';
import { grid } from '../test/fixtures';
import { frontierAt, partsOfStep } from './frontier';
import { buildTimeline, NEVER } from './timeline';

const every = fc.constantFrom(...Object.values(algorithms));

function solve(
  problem: Parameters<typeof runSearch>[1],
  algorithm: AlgorithmInfo = algorithms.astar,
) {
  const heuristic = straightLineHeuristic(problem.graph, problem.target);
  const trace = runSearch(algorithm.search, { ...problem, heuristic });
  return { trace, timeline: buildTimeline(problem.graph, trace, heuristic, algorithm.frontier) };
}

/** Replays a trace and lists each frontier entry with when it came in, went stale and left. */
function replay({ events }: Trace) {
  const entries: { node: number; enter: number; leave: number; stale: number; cost: number }[] = [];
  let step = 0;
  for (const event of events) {
    if (event.type === 'push') {
      // An older entry for the same node still waiting goes stale: the new one will be used.
      for (const old of entries) {
        if (old.node === event.node && old.leave === NEVER && old.stale === NEVER) old.stale = step;
      }
      entries.push({ node: event.node, enter: step, leave: NEVER, stale: NEVER, cost: event.cost });
    } else {
      if (event.type === 'pop') {
        step++;
        for (const old of entries) {
          if (old.node === event.node && old.leave === NEVER && old.stale === NEVER) {
            old.stale = step;
          }
        }
        entries[event.entry]!.stale = NEVER;
      }
      // A skip happens while the next step looks for its node, so it belongs to that step.
      entries[event.entry]!.leave = event.type === 'pop' ? step : step + 1;
    }
  }
  return entries;
}

describe('frontier entries in the timeline', () => {
  it('records every push with its node, cost, estimate and when it came and went', () => {
    fc.assert(
      fc.property(randomGeoProblem(), every, (problem, algorithm) => {
        const { trace, timeline: t } = solve(problem, algorithm);
        const expected = replay(trace);
        expect(t.entryCount).toBe(expected.length);
        expected.forEach((entry, i) => {
          expect(t.entryNode[i]).toBe(entry.node);
          expect(t.entryEnter[i]).toBe(entry.enter);
          expect(t.entryLeave[i]).toBe(entry.leave);
          expect(t.entryCost[i]).toBe(entry.cost);
        });
      }),
    );
  });
});

describe('frontierAt', () => {
  it('lists what is waiting at a step, in the order the search will take it', () => {
    fc.assert(
      fc.property(randomGeoProblem(), every, (problem, algorithm) => {
        const { trace, timeline: t } = solve(problem, algorithm);
        const entries = replay(trace);
        for (let step = 0; step <= t.steps; step++) {
          const waiting = entries
            .map((entry, i) => ({ ...entry, i }))
            .filter((e) => e.enter <= step && step < e.leave && step < e.stale);
          const { entries: listed, outdated } = frontierAt(t, step, 100);
          expect(new Set(listed)).toEqual(new Set(waiting.map((e) => e.i)));
          expect(outdated).toBe(
            entries.filter((e) => e.enter <= step && step < e.leave && e.stale <= step).length,
          );
          // The first one listed is the one actually expanded next.
          if (step < t.steps) expect(listed[0]).toBe(t.expandedEntry[step + 1]);
        }
      }),
    );
  });

  it('orders what never left by the frontier rule: priority, oldest or newest first', () => {
    const graph = grid(5);
    for (const algorithm of Object.values(algorithms)) {
      const { timeline: t } = solve({ graph, source: 0, target: 24 }, algorithm);
      const { entries } = frontierAt(t, t.steps, 100);
      const unleft = entries.filter((e) => t.entryLeave[e] === NEVER);
      const keys = unleft.map((e) =>
        algorithm.frontier === 'queue'
          ? e
          : algorithm.frontier === 'stack'
            ? -e
            : t.entryPriority[e]!,
      );
      expect(keys).toEqual([...keys].sort((a, b) => a - b));
    }
  });

  it('stops at the limit but still counts everything', () => {
    const { timeline: t } = solve({ graph: grid(6), source: 0, target: 35 }, algorithms.bfs);
    const step = Math.floor(t.steps / 2);
    const { entries, waiting } = frontierAt(t, step, 3);
    expect(entries).toHaveLength(3);
    expect(waiting).toBe(t.frontierSizeAt[step]);
  });
});

describe('partsOfStep', () => {
  it('splits each step into skips, the node taken, the goal check and its roads', () => {
    fc.assert(
      fc.property(randomGeoProblem(), every, (problem, algorithm) => {
        const { trace, timeline: t } = solve(problem, algorithm);
        // Rebuild the trace's events from the parts of every step.
        const rebuilt: string[] = ['push 0'];
        for (let step = 1; step <= t.steps; step++) {
          let rejected = 0;
          let goal = false;
          for (const part of partsOfStep(t, step)) {
            if (part.kind === 'skip') rebuilt.push(`skip ${part.entry}`);
            if (part.kind === 'take') rebuilt.push(`pop ${part.entry}`);
            if (part.kind === 'road') rebuilt.push(`push ${part.entry}`);
            if (part.kind === 'rejected') rejected = part.count;
            if (part.kind === 'goal') goal = true;
          }
          // Reaching B ends the search before its roads are looked at.
          if (goal) expect(step).toBe(t.steps);
          else expect(rejected).toBe(t.expandedDegree[step]! - t.pushesAt[step]!);
        }
        let pushes = 0;
        const actual = trace.events
          .map((e) => (e.type === 'push' ? `push ${pushes++}` : `${e.type} ${e.entry}`))
          // A search that ends without reaching B can still have skips after its last expansion.
          .slice(0, rebuilt.length);
        expect(rebuilt).toEqual(actual);
      }),
    );
  });

  it('checks for the goal only when the step reaches it', () => {
    const { timeline: t } = solve({ graph: grid(4), source: 0, target: 15 });
    expect(partsOfStep(t, t.steps).map((p) => p.kind)).toContain('goal');
    expect(partsOfStep(t, 1).map((p) => p.kind)).not.toContain('goal');
    expect(partsOfStep(t, 0)).toEqual([]);
  });

  it("remembers the best cost known for a road's end before it was improved", () => {
    const { timeline: t } = solve({ graph: grid(4), source: 0, target: 15 }, algorithms.dijkstra);
    for (let step = 1; step <= t.steps; step++) {
      for (const part of partsOfStep(t, step)) {
        if (part.kind === 'road') {
          expect(t.entryPrevious[part.entry]).toBeGreaterThan(t.entryCost[part.entry]!);
        }
      }
    }
  });
});
