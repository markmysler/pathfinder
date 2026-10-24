import type { ComponentType } from 'react';
import alt from './alt';
import astar from './astar';
import bellmanford from './bellmanford';
import bfs from './bfs';
import bidirectional from './bidirectional';
import ch from './ch';
import dfs from './dfs';
import dijkstra from './dijkstra';
import frontier from './frontier';
import glossary from './glossary';
import graphs from './graphs';
import greedy from './greedy';
import heuristics from './heuristics';
import roads from './roads';
import which from './which';

/** One article per topic, by slug. */
export const ARTICLES: Record<string, ComponentType> = {
  graphs,
  roads,
  frontier,
  heuristics,
  bfs,
  dfs,
  greedy,
  dijkstra,
  astar,
  bidirectional,
  bellmanford,
  alt,
  ch,
  which,
  glossary,
};
