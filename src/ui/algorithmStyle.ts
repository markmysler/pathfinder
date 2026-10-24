import type { CSSProperties } from 'react';
import { algorithms, type AlgorithmId, type AlgorithmInfo } from '../algorithms';

export interface AlgorithmStyle {
  /** Night Chart colour; each also differs in lightness, and always comes with the badge. */
  color: string;
  badge: string;
  /** Name for compact chips on phones. */
  short: string;
  blurb: string;
  /** The side from A, for a search from both ends with no one-way version to take it from. */
  colorA?: string;
}

export const ALGORITHM_STYLE: Record<AlgorithmId, AlgorithmStyle> = {
  bfs: {
    short: 'BFS',
    color: '#4EA8F5',
    badge: 'BFS',
    blurb: 'Level by level. Fewest turns; ignores speed.',
  },
  dfs: {
    short: 'DFS',
    color: '#F06CA8',
    badge: 'DFS',
    blurb: 'Follows one road as far as it goes, then backtracks.',
  },
  greedy: {
    short: 'Greedy',
    color: '#F5B83D',
    badge: 'GBF',
    blurb: 'Always heads for whatever looks closest to B.',
  },
  dijkstra: {
    short: 'Dijkstra',
    color: '#2FC59A',
    badge: 'DIJ',
    blurb: 'Spreads out by travel cost. Always finds the best route.',
  },
  astar: {
    short: 'A*',
    color: '#B197FC',
    badge: 'A*',
    blurb: 'Dijkstra steered by a distance estimate. Best route, less work.',
  },
  // Searches from both ends take a lighter tint of their one-way colour, which is also what
  // their side from B is drawn in; their side from A keeps the one-way colour.
  bibfs: {
    short: 'Bi-BFS',
    color: '#9ECFF9',
    badge: 'BFS',
    blurb: 'Breadth-first from both ends. Same fewest-roads route.',
  },
  bidijkstra: {
    short: 'Bi-Dijkstra',
    color: '#8DDFC7',
    badge: 'DIJ',
    blurb: 'Dijkstra from both ends. Same best route, about half the work.',
  },
  biastar: {
    short: 'Bi-A*',
    color: '#D4C6FD',
    badge: 'A*',
    blurb: 'A* from both ends, sharing one estimate. Same best route.',
  },
  bellmanford: {
    short: 'Bellman-Ford',
    color: '#A3D95B',
    badge: 'BF',
    blurb:
      'Corrects itself round after round until nothing improves. Slow, but copes with negative costs.',
  },
  alt: {
    short: 'ALT',
    color: '#D57BF0',
    badge: 'ALT',
    blurb: 'A* with a sharper estimate, worked out from 8 landmarks. Same best route.',
  },
  ch: {
    short: 'CH',
    color: '#F3E3C6',
    colorA: '#E2C08D',
    badge: 'CH',
    blurb:
      'Adds shortcuts first, then searches only uphill from both ends. Same best route, tiny search.',
  },
};

/** The colours of a search's two sides: from A, and from B. One-way searches only have one. */
export function sideColors(algorithm: AlgorithmId): [string, string] {
  const info: AlgorithmInfo = algorithms[algorithm];
  const { color: own, colorA } = ALGORITHM_STYLE[algorithm];
  const oneWay = info.oneWay as AlgorithmId | undefined;
  return [colorA ?? (oneWay ? ALGORITHM_STYLE[oneWay].color : own), own];
}

/**
 * Sets `--algo` to the algorithm's colour, for styles that tint by algorithm; `--algo-a` to the
 * colour of its side from A; and `--algo-fill` to fill badges and dots, in two halves for a
 * search from both ends.
 */
export function algoColor(algorithm: AlgorithmId): CSSProperties {
  const [a, b] = sideColors(algorithm);
  return {
    '--algo': b,
    '--algo-a': a,
    '--algo-fill': a === b ? a : `linear-gradient(90deg, ${a} 50%, ${b} 50%)`,
  } as CSSProperties;
}

/** A weight on the estimate, like "1.5×". */
export const formatWeight = (weight: number) => `${Math.round(weight * 10) / 10}×`;

/** The algorithm's name, with the weight when A* weighs its estimate. */
export const algorithmName = (algorithm: AlgorithmId, weight = 1) =>
  weight === 1
    ? algorithms[algorithm].name
    : `${algorithms[algorithm].name} · ${formatWeight(weight)}`;
