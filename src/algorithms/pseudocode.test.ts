import fc from 'fast-check';
import { partsOfStep } from '../playback/frontier';
import { buildTimeline } from '../playback/timeline';
import { randomGeoProblem } from '../test/arbitraries';
import { straightLineHeuristic } from './heuristics';
import { algorithms, type AlgorithmId } from './index';
import { pseudocode } from './pseudocode';
import { runSearch } from './trace';

const ids = Object.keys(algorithms) as AlgorithmId[];

// What the line a part points at must say, whatever the algorithm.
const FOCUS: Record<string, RegExp> = {
  take: /← (frontier|side)\.(take|pop)/,
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
        const heuristic = straightLineHeuristic(problem.graph, problem.target);
        const backwardHeuristic = straightLineHeuristic(problem.graph, problem.source);
        const trace = runSearch(algorithms[id].search, {
          ...problem,
          heuristic,
          backwardHeuristic,
        });
        const t = buildTimeline(
          problem.graph,
          trace,
          heuristic,
          algorithms[id].frontier,
          backwardHeuristic,
        );
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
