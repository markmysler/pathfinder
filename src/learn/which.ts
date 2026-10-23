import type { AlgorithmId } from '../algorithms';

/** What each algorithm takes next, what it finds, and what it is good for. */
export const WHICH: readonly {
  id: AlgorithmId;
  name: string;
  takes: string;
  finds: string;
  goodFor: string;
}[] = [
  {
    id: 'bfs',
    name: 'Breadth-first',
    takes: 'Queue: oldest first',
    finds: 'Fewest roads, not cheapest',
    goodFor: 'Counting hops; graphs where every edge costs the same',
  },
  {
    id: 'dfs',
    name: 'Depth-first',
    takes: 'Stack: newest first',
    finds: 'Any route',
    goodFor: 'Mazes, and checking what can be reached at all',
  },
  {
    id: 'greedy',
    name: 'Greedy best-first',
    takes: 'Lowest estimate h',
    finds: 'Any route, often close',
    goodFor: 'A quick answer when good enough is fine',
  },
  {
    id: 'dijkstra',
    name: 'Dijkstra',
    takes: 'Lowest cost so far g',
    finds: 'The cheapest',
    goodFor: 'Cheapest routes, or distances to everywhere at once',
  },
  {
    id: 'astar',
    name: 'A* search',
    takes: 'Lowest g + h',
    finds: 'The cheapest, if h never overestimates',
    goodFor: 'Cheapest routes towards a known destination',
  },
];
