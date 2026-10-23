import { caption, diagramStates, type DiagramState } from './diagram';
import { DETOUR, HOPS, SIX } from './networks';

const summary = (s: DiagramState) => ({
  explored: s.explored,
  next: s.next,
  frontier: s.frontier.map((f) => f.id),
});

describe('diagramStates', () => {
  it('replays A* on the six-node network as the article shows it', () => {
    const states = diagramStates(SIX, 'astar');
    expect(states).toHaveLength(4);
    expect(summary(states[2]!)).toEqual({
      explored: ['S', 'A'],
      next: 'B',
      frontier: ['B', 'C', 'D'],
    });
    expect(states[2]!.frontier.map((f) => [f.g, f.h])).toEqual([
      [5, 1],
      [2, 5],
      [6, 3],
    ]);
    expect(states.at(-1)!.route).toEqual({ path: ['S', 'A', 'B', 'T'], cost: 6 });
  });

  it('knows how each reached node was reached, for drawing the roads used', () => {
    const third = diagramStates(SIX, 'astar')[2]!;
    expect(third.reached.get('D')).toEqual({ g: 6, from: 'A' });
    expect(third.reached.get('C')).toEqual({ g: 2, from: 'S' });
    expect(third.reached.has('T')).toBe(false);
  });

  it('shows Dijkstra spreading by cost on the same roads, taking more steps', () => {
    const states = diagramStates(SIX, 'dijkstra');
    expect(states.length).toBeGreaterThan(4);
    expect(states.at(-1)!.route!.cost).toBe(6);
    // Dijkstra always takes the lowest g it has.
    for (const s of states) expect(s.frontier[0]!.g).toBe(Math.min(...s.frontier.map((f) => f.g)));
  });

  it('lets DFS wander down the first road it finds', () => {
    const states = diagramStates(SIX, 'dfs');
    expect(states.map((s) => s.next)).toEqual(['S', 'C', 'D', 'A', 'B', 'T']);
    expect(states.at(-1)!.route).toEqual({ path: ['S', 'C', 'D', 'A', 'B', 'T'], cost: 12 });
  });

  it('shows BFS taking the fewest roads, not the cheapest', () => {
    expect(diagramStates(HOPS, 'bfs').at(-1)!.route).toEqual({ path: ['S', 'T'], cost: 9 });
    expect(diagramStates(HOPS, 'dijkstra').at(-1)!.route!.cost).toBe(3);
  });

  it('lets greedy fall for the detour that A* sees through', () => {
    expect(diagramStates(DETOUR, 'greedy').at(-1)!.route).toEqual({
      path: ['S', 'A', 'T'],
      cost: 11,
    });
    expect(diagramStates(DETOUR, 'astar').at(-1)!.route).toEqual({
      path: ['S', 'B', 'T'],
      cost: 6,
    });
  });

  it('orders the frontier the way each algorithm takes it', () => {
    const bfs = diagramStates(SIX, 'bfs')[1]!;
    expect(bfs.frontier[0]!.id).toBe(bfs.next);
    const dfs = diagramStates(SIX, 'dfs')[1]!;
    expect(dfs.frontier[0]!.id).toBe(dfs.next);
  });
});

describe('caption', () => {
  it('explains the A* step from the article, contrast with Dijkstra included', () => {
    expect(caption(diagramStates(SIX, 'astar')[2]!, 'astar')).toBe(
      'S and A are explored. The frontier holds B (f 6), C (f 7) and D (f 9). A* takes B next: ' +
        'it has the lowest f, even though C is cheaper to reach. Dijkstra would have taken C.',
    );
  });

  it('starts with only the start in the frontier', () => {
    expect(caption(diagramStates(SIX, 'bfs')[0]!, 'bfs')).toBe(
      'Only S is in the queue, so Breadth-first search takes it first.',
    );
  });

  it('describes queues and stacks by their order, and mentions ties', () => {
    expect(caption(diagramStates(SIX, 'bfs')[1]!, 'bfs')).toBe(
      'S is explored. The queue holds C and A. Breadth-first search takes C next: it has waited longest.',
    );
    expect(caption(diagramStates(SIX, 'dijkstra')[1]!, 'dijkstra')).toBe(
      'S is explored. The frontier holds C (g 2) and A (g 2). Dijkstra takes C next: it has the lowest g, tied with A.',
    );
  });

  it('ends with the route, and how it compares with the cheapest', () => {
    const greedy = diagramStates(DETOUR, 'greedy');
    expect(caption(greedy.at(-1)!, 'greedy', 6)).toBe(
      'Greedy best-first takes T, the destination, and stops. Its route S → A → T costs 11; the cheapest costs 6.',
    );
    expect(caption(diagramStates(SIX, 'astar').at(-1)!, 'astar', 6)).toBe(
      'A* takes T, the destination, and stops. Its route S → A → B → T costs 6, the cheapest there is.',
    );
  });
});
