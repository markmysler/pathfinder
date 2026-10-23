import type { AlgorithmId } from '../algorithms';

export interface AlgorithmStyle {
  /** Night Chart colour; each also differs in lightness, and always comes with the badge. */
  color: string;
  badge: string;
  blurb: string;
}

export const ALGORITHM_STYLE: Record<AlgorithmId, AlgorithmStyle> = {
  bfs: { color: '#4EA8F5', badge: 'BFS', blurb: 'Level by level. Fewest turns; ignores speed.' },
  dfs: {
    color: '#F06CA8',
    badge: 'DFS',
    blurb: 'Follows one road as far as it goes, then backtracks.',
  },
  greedy: {
    color: '#F5B83D',
    badge: 'GBF',
    blurb: 'Always heads for whatever looks closest to B.',
  },
  dijkstra: {
    color: '#2FC59A',
    badge: 'DIJ',
    blurb: 'Spreads out by travel cost. Always finds the best route.',
  },
  astar: {
    color: '#B197FC',
    badge: 'A*',
    blurb: 'Dijkstra steered by a distance estimate. Best route, less work.',
  },
};
