import { algorithms } from './index';

describe('algorithm registry', () => {
  it('lists the base algorithms in teaching order', () => {
    expect(Object.keys(algorithms)).toEqual(['bfs', 'dfs', 'greedy', 'dijkstra', 'astar']);
  });

  it('keys every entry by its id', () => {
    for (const [key, info] of Object.entries(algorithms)) expect(info.id).toBe(key);
  });

  it('describes which algorithms guarantee the cheapest route', () => {
    const optimal = Object.values(algorithms)
      .filter((a) => a.optimal)
      .map((a) => a.id);
    expect(optimal).toEqual(['dijkstra', 'astar']);
  });
});
