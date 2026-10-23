import { algorithms } from './index';

describe('algorithm registry', () => {
  it('lists the base algorithms in teaching order', () => {
    expect(Object.keys(algorithms)).toEqual([
      'bfs',
      'dfs',
      'greedy',
      'dijkstra',
      'astar',
      'bibfs',
      'bidijkstra',
      'biastar',
    ]);
  });

  it('keys every entry by its id', () => {
    for (const [key, info] of Object.entries(algorithms)) expect(info.id).toBe(key);
  });

  it('describes which algorithms guarantee the cheapest route', () => {
    const optimal = Object.values(algorithms)
      .filter((a) => a.optimal)
      .map((a) => a.id);
    expect(optimal).toEqual(['dijkstra', 'astar', 'bidijkstra', 'biastar']);
  });

  it('links each bidirectional search to the one-way search it runs from both ends', () => {
    const pairs = Object.values(algorithms)
      .filter((a) => a.bidirectional)
      .map((a) => [a.id, a.oneWay]);
    expect(pairs).toEqual([
      ['bibfs', 'bfs'],
      ['bidijkstra', 'dijkstra'],
      ['biastar', 'astar'],
    ]);
  });
});
