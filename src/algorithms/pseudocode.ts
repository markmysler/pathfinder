import type { AlgorithmId } from './index';

/** The kinds of thing a step does, in the order it does them (see playback/frontier). */
export type StepPartKind = 'skip' | 'take' | 'goal' | 'road' | 'rejected';

/** Lines are numbered from 1; `focus` is the line to point at, `lines` all that run. */
export interface PartLines {
  lines: number[];
  focus: number;
}

export interface Pseudocode {
  lines: string[];
  parts: Partial<Record<StepPartKind, PartLines>>;
}

const span = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Dijkstra and A*: the same loop, ordered by g, or by g plus a (possibly weighted) estimate. */
function bestFirst(name: string, args: string, order: string, pushed: string): Pseudocode {
  return {
    lines: [
      `function ${name}(${args})`,
      '  g[start] ← 0',
      `  frontier ← priority queue ordered by ${order}`,
      '  frontier.push(start)',
      '  while frontier is not empty',
      '    node ← frontier.popLowest()',
      '    if this entry is outdated: skip it',
      '    if node = goal: return path to node',
      '    for each road from node to next, costing c',
      '      if g[node] + c < g[next]',
      '        g[next] ← g[node] + c',
      '        parent[next] ← node',
      `        frontier.push(next, ${pushed})`,
      '  return "no route"',
    ],
    parts: {
      skip: { lines: [6, 7], focus: 7 },
      take: { lines: [6, 7], focus: 6 },
      goal: { lines: [8], focus: 8 },
      road: { lines: span(9, 13), focus: 10 },
      rejected: { lines: [9, 10], focus: 10 },
    },
  };
}

/** BFS and greedy: each node joins the frontier once, the first time it is seen. */
function firstSeen(name: string, args: string, frontier: string, take: string, add: string) {
  return {
    lines: [
      `function ${name}(${args})`,
      '  seen ← {start}',
      `  frontier ← ${frontier}`,
      '  frontier.add(start)',
      '  while frontier is not empty',
      `    node ← frontier.${take}()`,
      '    if node = goal: return path to node',
      '    for each road from node to next',
      '      if next is not in seen',
      '        add next to seen',
      '        parent[next] ← node',
      `        frontier.add(${add})`,
      '  return "no route"',
    ],
    parts: {
      take: { lines: [6], focus: 6 },
      goal: { lines: [7], focus: 7 },
      road: { lines: span(8, 12), focus: 9 },
      rejected: { lines: [8, 9], focus: 9 },
    },
  } satisfies Pseudocode;
}

const formatWeight = (weight: number) => `${Math.round(weight * 10) / 10}`;

/** What Pathfinder runs for each algorithm, written to be read rather than compiled. */
export function pseudocode(algorithm: AlgorithmId, weight = 1): Pseudocode {
  switch (algorithm) {
    case 'bfs':
      return firstSeen('bfs', 'start, goal', 'queue', 'takeOldest', 'next');
    case 'greedy':
      return firstSeen(
        'greedy',
        'start, goal, h',
        'priority queue ordered by h',
        'popLowest',
        'next, h(next)',
      );
    case 'dijkstra':
      return bestFirst('dijkstra', 'start, goal', 'g', 'g[next]');
    case 'astar': {
      const w = weight === 1 ? '' : `${formatWeight(weight)} × `;
      return bestFirst('aStar', 'start, goal, h', `g + ${w}h`, `g[next] + ${w}h(next)`);
    }
    case 'dfs':
      return {
        lines: [
          'function dfs(start, goal)',
          '  expanded ← {}',
          '  frontier ← stack',
          '  frontier.push(start)',
          '  while frontier is not empty',
          '    node, road ← frontier.takeNewest()',
          '    if node is in expanded: skip it',
          '    add node to expanded; parent[node] ← road',
          '    if node = goal: return path to node',
          '    for each road from node to next',
          '      if next is not in expanded',
          '        frontier.push(next, road)',
          '  return "no route"',
        ],
        parts: {
          skip: { lines: [6, 7], focus: 7 },
          take: { lines: [6, 7, 8], focus: 6 },
          goal: { lines: [9], focus: 9 },
          road: { lines: [10, 11, 12], focus: 11 },
          rejected: { lines: [10, 11], focus: 11 },
        },
      };
  }
}
