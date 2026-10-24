import fc from 'fast-check';
import { algorithms, type AlgorithmInfo } from '../algorithms';
import type { Trace } from '../algorithms/trace';
import { randomGeoProblem } from '../test/arbitraries';
import { grid } from '../test/fixtures';
import { solve } from '../test/timelines';
import { frontierAt, partsOfStep } from './frontier';
import { NEVER } from './timeline';

const every = fc.constantFrom(...(Object.values(algorithms) as AlgorithmInfo[]));

interface Replayed {
  node: number;
  side: number;
  enter: number;
  leave: number;
  stale: number;
  cost: number;
}

/**
 * Replays a trace and lists each frontier entry with when it came in, went stale and left. Each
 * side of a bidirectional search has its own frontier.
 */
function replay({ events }: Trace) {
  const entries: Replayed[] = [];
  const same = (old: Replayed, node: number, side: number) =>
    old.node === node && old.side === side && old.leave === NEVER && old.stale === NEVER;
  let step = 0;
  for (const event of events) {
    if (event.type === 'meet') continue;
    const side = event.side === 'backward' ? 1 : 0;
    if (event.type === 'push') {
      // An older entry for the same node still waiting goes stale: the new one will be used.
      for (const old of entries) if (same(old, event.node, side)) old.stale = step;
      entries.push({
        node: event.node,
        side,
        enter: step,
        leave: NEVER,
        stale: NEVER,
        cost: event.cost,
      });
    } else {
      if (event.type === 'pop') {
        step++;
        for (const old of entries) if (same(old, event.node, side)) old.stale = step;
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
          expect(t.entrySide[i]).toBe(entry.side);
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

  it("lists one side's frontier of a bidirectional search, with that side's counts", () => {
    fc.assert(
      fc.property(
        randomGeoProblem(),
        fc.constantFrom(algorithms.bibfs, algorithms.bidijkstra, algorithms.biastar),
        (problem, algorithm) => {
          const { timeline: t } = solve(problem, algorithm);
          for (let step = 0; step <= t.steps; step++) {
            const all = frontierAt(t, step, 1000);
            const sides = [0, 1].map((side) => frontierAt(t, step, 1000, side));
            sides.forEach((listed, side) =>
              listed.entries.forEach((e) => expect(t.entrySide[e]).toBe(side)),
            );
            expect(new Set([...sides[0]!.entries, ...sides[1]!.entries])).toEqual(
              new Set(all.entries),
            );
            expect(sides[0]!.waiting + sides[1]!.waiting).toBe(all.waiting);
            expect(sides[0]!.outdated + sides[1]!.outdated).toBe(all.outdated);
          }
        },
      ),
    );
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
        let pushes = 0;
        const actual = trace.events.map((e) =>
          e.type === 'push'
            ? `push ${pushes++}`
            : e.type === 'meet'
              ? `meet ${e.node}`
              : `${e.type} ${e.entry}`,
        );
        // Rebuild the trace's events from the parts of every step, after the start (the source,
        // and the target too when searching from both ends).
        const rebuilt = actual.slice(0, algorithm.bidirectional ? 2 : 1);
        for (let step = 1; step <= t.steps; step++) {
          let rejected = 0;
          let goal = false;
          let stop = false;
          for (const part of partsOfStep(t, step)) {
            if (part.kind === 'skip') rebuilt.push(`skip ${part.entry}`);
            if (part.kind === 'take') rebuilt.push(`pop ${part.entry}`);
            if (part.kind === 'road') rebuilt.push(`push ${part.entry}`);
            if (part.kind === 'meet') rebuilt.push(`meet ${t.meetNode[part.meeting]}`);
            if (part.kind === 'rejected') rejected = part.count;
            if (part.kind === 'goal') goal = true;
            if (part.kind === 'stop') stop = true;
          }
          // Reaching B ends a one-way search before its roads are looked at.
          if (goal) expect(step).toBe(t.steps);
          else expect(rejected).toBe(t.expandedDegree[step]! - t.pushesAt[step]!);
          expect(goal && (algorithm.bidirectional || Boolean(algorithm.exhaustive))).toBe(false);
          // A bidirectional search stops after its last step, once it is sure of the route.
          expect(stop).toBe(algorithm.bidirectional && step === t.steps);
        }
        // A search that ends without reaching B can still have skips after its last expansion.
        expect(rebuilt).toEqual(actual.slice(0, rebuilt.length));
      }),
    );
  });

  it('never checks for the goal in a search that keeps going after B', () => {
    const { timeline: t } = solve(
      { graph: grid(4), source: 0, target: 15 },
      algorithms.bellmanford,
    );
    for (let step = 1; step <= t.steps; step++) {
      expect(partsOfStep(t, step).map((p) => p.kind)).not.toContain('goal');
    }
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
