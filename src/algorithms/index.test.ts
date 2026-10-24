import { algorithms, oneWayOf, type AlgorithmInfo } from './index';

describe('algorithm registry', () => {
  it('lists the algorithms in teaching order', () => {
    expect(Object.keys(algorithms)).toEqual([
      'bfs',
      'dfs',
      'greedy',
      'dijkstra',
      'astar',
      'bibfs',
      'bidijkstra',
      'biastar',
      'bellmanford',
      'alt',
      'ch',
    ]);
  });

  it('keys every entry by its id', () => {
    for (const [key, info] of Object.entries(algorithms)) expect(info.id).toBe(key);
  });

  it('describes which algorithms guarantee the cheapest route', () => {
    const optimal = Object.values(algorithms)
      .filter((a) => a.optimal)
      .map((a) => a.id);
    expect(optimal).toEqual([
      'dijkstra',
      'astar',
      'bidijkstra',
      'biastar',
      'bellmanford',
      'alt',
      'ch',
    ]);
  });

  it('links each bidirectional search to the one-way search it runs from both ends', () => {
    const pairs = Object.values(algorithms)
      .filter((a) => a.bidirectional && !a.advanced)
      .map((a) => [a.id, a.oneWay]);
    expect(pairs).toEqual([
      ['bibfs', 'bfs'],
      ['bidijkstra', 'dijkstra'],
      ['biastar', 'astar'],
    ]);
  });

  it('groups the advanced algorithms, and says which prepare the map first', () => {
    const advanced = (Object.values(algorithms) as AlgorithmInfo[]).filter((a) => a.advanced);
    expect(advanced.map((a) => [a.id, a.prepares ?? null])).toEqual([
      ['bellmanford', null],
      ['alt', 'landmarks'],
      ['ch', 'hierarchy'],
    ]);
  });

  it('marks Bellman-Ford as running until nothing improves, not stopping at B', () => {
    const exhaustive = (Object.values(algorithms) as AlgorithmInfo[]).filter((a) => a.exhaustive);
    expect(exhaustive.map((a) => a.id)).toEqual(['bellmanford']);
  });

  it('runs contraction hierarchies from both ends, with no one-way version', () => {
    expect(algorithms.ch).toMatchObject({ bidirectional: true, frontier: 'priority' });
    expect(oneWayOf('ch')).toBe('ch');
  });
});
