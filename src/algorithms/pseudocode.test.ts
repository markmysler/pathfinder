import fc from 'fast-check';
import { partsOfStep } from '../playback/frontier';
import { randomGeoProblem } from '../test/arbitraries';
import { solve } from '../test/timelines';
import { algorithms, type AlgorithmId } from './index';
import { pseudocode } from './pseudocode';

const ids = Object.keys(algorithms) as AlgorithmId[];

// What the line a part points at must say, whatever the algorithm.
const FOCUS: Record<string, RegExp> = {
  take: /← (frontier|side|queue)\.(take|pop)/,
  skip: /skip it/,
  goal: /= goal/,
  road: /^\s*if /,
  rejected: /^\s*if /,
  meet: /A\[next\] \+ \w+B\[next\] < best/,
  stop: /^\s*while .* < best/,
};

describe('pseudocode', () => {
  it.each(ids)('%s: every part of every step points at the line that does it', (id) => {
    const code = pseudocode(id);
    fc.assert(
      fc.property(randomGeoProblem(), (problem) => {
        const t = solve(problem, algorithms[id]).timeline;
        for (let step = 1; step <= t.steps; step++) {
          for (const part of partsOfStep(t, step)) {
            const lines = code.parts[part.kind];
            expect(lines, `${id} has no lines for ${part.kind}`).toBeDefined();
            expect(code.lines[lines!.focus - 1]).toMatch(FOCUS[part.kind]!);
            expect(lines!.lines).toContain(lines!.focus);
            const pushes = lines!.lines.some((n) => /\.(push|add)\(next/.test(code.lines[n - 1]!));
            if (part.kind === 'road') expect(pushes).toBe(true);
            if (part.kind === 'rejected') expect(pushes).toBe(false);
          }
        }
      }),
      { numRuns: 30 },
    );
  });

  it('orders the frontier the way each algorithm does', () => {
    expect(pseudocode('bfs').lines.join('\n')).toMatch(/queue/);
    expect(pseudocode('dfs').lines.join('\n')).toMatch(/stack/);
    expect(pseudocode('greedy').lines.join('\n')).toMatch(/ordered by h\b/);
    expect(pseudocode('dijkstra').lines.join('\n')).toMatch(/ordered by g\b/);
    expect(pseudocode('astar').lines.join('\n')).toMatch(/ordered by g \+ h/);
    expect(pseudocode('bibfs').lines.join('\n')).toMatch(/frontier B ← queue/);
    expect(pseudocode('bidijkstra').lines.join('\n')).toMatch(/ordered by gB\b/);
    expect(pseudocode('biastar').lines.join('\n')).toMatch(/ordered by gB − p\b/);
    expect(pseudocode('bellmanford').lines.join('\n')).toMatch(/queue\.takeOldest/);
    expect(pseudocode('alt').lines.join('\n')).toMatch(/ordered by g \+ h/);
    expect(pseudocode('ch').lines.join('\n')).toMatch(/ordered by gB, holding goal/);
  });

  it('has no goal check for Bellman-Ford, which runs until nothing improves', () => {
    const code = pseudocode('bellmanford');
    expect(code.lines.join('\n')).not.toMatch(/= goal/);
    expect(code.parts.goal).toBeUndefined();
  });

  it('works out ALT’s estimate from the landmarks before running A*', () => {
    const code = pseudocode('alt').lines;
    expect(code.slice(1, 4).join('\n')).toMatch(/largest, over landmarks L/);
    expect(code.join('\n')).toMatch(/if node = goal/);
  });

  it('lists contraction before the search, and starts the search at its own set-up lines', () => {
    const code = pseudocode('ch');
    expect(code.lines[0]).toMatch(/^function contract/);
    const search = code.lines.findIndex((line) => /^function chSearch/.test(line)) + 1;
    expect(search).toBeGreaterThan(1);
    expect(Math.min(...code.start!.lines)).toBe(search + 1);
    expect(code.lines[code.start!.focus - 1]).toMatch(/frontier B/);
    expect(code.lines.join('\n')).toMatch(/up to next/);
  });

  it("pushes a two-sided A*'s nodes with the shared estimate, added from A and taken off from B", () => {
    const code = pseudocode('biastar').lines.join('\n');
    expect(code).toMatch(/p\(n\) ← \(hB\(n\) − hA\(n\)\) \/ 2/);
    expect(code).toMatch(/frontier A ← priority queue ordered by gA \+ p/);
  });

  it('writes the weight into weighted A*', () => {
    const code = pseudocode('astar', 1.5).lines.join('\n');
    expect(code).toMatch(/ordered by g \+ 1\.5 × h/);
    expect(code).toMatch(/g\[next\] \+ 1\.5 × h\(next\)/);
  });
});
