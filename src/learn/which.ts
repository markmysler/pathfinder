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
  {
    id: 'bidijkstra',
    name: 'Bidirectional',
    takes: 'Two frontiers: whichever side is nearer its end',
    finds: 'The same as the one-way search',
    goodFor: 'Routes with a known destination, about half of Dijkstra’s work',
  },
  {
    id: 'bellmanford',
    name: 'Bellman-Ford',
    takes: 'Queue: oldest first, round after round',
    finds: 'The cheapest, even with negative costs',
    goodFor: 'Costs below zero, and spotting loops that pay out',
  },
  {
    id: 'alt',
    name: 'ALT',
    takes: 'Lowest g + h, h from landmarks',
    finds: 'The cheapest',
    goodFor: 'Many routes on a big map whose costs rarely change',
  },
  {
    id: 'ch',
    name: 'Contraction hierarchies',
    takes: 'Two frontiers, each only climbing',
    finds: 'The cheapest',
    goodFor: 'Answering millions of routes on one prepared map',
  },
];
