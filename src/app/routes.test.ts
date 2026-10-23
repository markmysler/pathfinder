import { exploreHref, learnHref, parseHash } from './routes';

describe('parseHash', () => {
  it('opens Explore by default, optionally with algorithms chosen', () => {
    expect(parseHash('')).toEqual({ page: 'explore' });
    expect(parseHash('#/')).toEqual({ page: 'explore' });
    expect(parseHash('#/?algorithms=dijkstra,astar')).toEqual({
      page: 'explore',
      algorithms: ['dijkstra', 'astar'],
    });
  });

  it('ignores algorithms it does not know', () => {
    expect(parseHash('#/?algorithms=astar,teleport')).toEqual({
      page: 'explore',
      algorithms: ['astar'],
    });
    expect(parseHash('#/?algorithms=nope')).toEqual({ page: 'explore' });
  });

  it('opens Learn, on its home page or on a topic', () => {
    expect(parseHash('#/learn')).toEqual({ page: 'learn', topic: null });
    expect(parseHash('#/learn/astar')).toEqual({ page: 'learn', topic: 'astar' });
  });
});

describe('links', () => {
  it('round-trips through parseHash', () => {
    expect(parseHash(exploreHref(['bfs', 'dfs']))).toEqual({
      page: 'explore',
      algorithms: ['bfs', 'dfs'],
    });
    expect(parseHash(learnHref('heuristics'))).toEqual({ page: 'learn', topic: 'heuristics' });
    expect(learnHref()).toBe('#/learn');
  });
});
