import {
  bothWaysCaption,
  bothWaysStates,
  caption,
  diagramStates,
  rushHour,
  type DiagramState,
} from './diagram';
import { DETOUR, HOPS, SIX, TRAP } from './networks';

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

describe('bothWaysStates', () => {
  const states = bothWaysStates(TRAP, 'bidijkstra');

  it('records each step from both ends: who took it and what each side has', () => {
    expect(states.map((s) => [s.side, s.took])).toEqual([
      ['A', 'S'],
      ['B', 'T'],
      ['A', 'P'],
      ['A', 'Q'],
    ]);
    const second = states[1]!;
    expect(second.explored).toEqual({ A: ['S'], B: ['T'] });
    expect(second.reachedNow).toEqual(['P', 'R']);
    expect(second.frontier.A.map((f) => [f.id, f.g])).toEqual([
      ['P', 1],
      ['Q', 2],
    ]);
    expect(second.frontier.B.map((f) => [f.id, f.g])).toEqual([
      ['R', 2],
      ['P', 10],
    ]);
    expect(second.reached.B.get('P')).toEqual({ g: 10, from: 'T' });
  });

  it('meets first at P, then finds the cheaper meeting at R and stops', () => {
    expect(states.map((s) => s.meeting?.id ?? null)).toEqual([null, 'P', 'P', 'R']);
    expect(states[1]!.meeting).toEqual({ id: 'P', fromA: 1, toB: 10, isNew: true });
    expect(states[2]!.meeting!.isNew).toBe(false);
    expect(states.at(-1)!.route).toEqual({ path: ['S', 'Q', 'R', 'T'], cost: 6 });
    expect(states.map((s) => s.next)).toEqual([
      { A: 1, B: 0 },
      { A: 1, B: 2 },
      { A: 2, B: 2 },
      { A: 4, B: 2 },
    ]);
  });
});

describe('bothWaysCaption', () => {
  const states = bothWaysStates(TRAP, 'bidijkstra');

  it('explains the first meeting, and why it is not the answer yet', () => {
    expect(bothWaysCaption(states[1]!)).toBe(
      'B explored T and reached P and R. A had already reached P, so the sides meet there: ' +
        'S → P → T costs 1 + 10 = 11. That is not the answer yet. The next nodes are 1 from A ' +
        'and 2 from B, together 3, so a route through unexplored roads could still cost less than 11.',
    );
  });

  it('says when the sides have not met, and when the best route is still being checked', () => {
    expect(bothWaysCaption(states[0]!)).toBe(
      'A explored S and reached P and Q. The sides have not met yet.',
    );
    expect(bothWaysCaption(states[2]!)).toBe(
      'A explored P and reached T. Best route so far: 11. The next nodes are 2 from A and 2 ' +
        'from B, together 4, still less than 11, so the search goes on.',
    );
  });

  it('ends once nothing left can beat the best route', () => {
    expect(bothWaysCaption(states[3]!)).toBe(
      'A explored Q and reached R. B had already reached R, so the sides meet there: ' +
        'S → Q → R → T costs 4 + 2 = 6. The next nodes are 4 from A and 2 from B, together 6: ' +
        'no less than 6, so nothing left can beat it. The search stops.',
    );
  });
});

describe('rushHour', () => {
  it('reroutes Dijkstra when one road slows to a quarter of its speed', () => {
    const clear = rushHour(SIX, null);
    expect(clear.route).toEqual({ path: ['S', 'A', 'B', 'T'], cost: 6 });
    expect(clear.before).toBeNull();

    const jam = rushHour(SIX, { road: ['A', 'B'], share: 0.25 });
    expect(jam.route).toEqual({ path: ['S', 'C', 'D', 'T'], cost: 7 });
    expect(jam.before).toEqual({ path: ['S', 'A', 'B', 'T'], cost: 6, costNow: 15 });
    expect(jam.costs.get('A–B')).toEqual({ usual: 3, now: 12 });
    expect(jam.costs.get('S–A')).toEqual({ usual: 2, now: 2 });
  });
});
