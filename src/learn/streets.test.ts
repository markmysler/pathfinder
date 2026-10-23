import { streetSearch, STREETS_FROM, STREETS_TO } from './streets';

describe('streetSearch', () => {
  it('runs a real search on recorded streets and keeps what the map needs', () => {
    const dijkstra = streetSearch('dijkstra');
    const astar = streetSearch('astar');
    expect(astar.route!.cost).toBeCloseTo(dijkstra.route!.cost, 6);
    expect(astar.expanded).toBeLessThan(dijkstra.expanded);
    expect(dijkstra.roads.length).toBeGreaterThan(astar.roads.length);
    expect(dijkstra.route!.points.length).toBeGreaterThan(2);
  });

  it('projects everything into the same box, with A and B inside it', () => {
    const run = streetSearch('bfs');
    const inside = ([x, y]: readonly [number, number]) =>
      x >= 0 && x <= run.size[0] && y >= 0 && y <= run.size[1];
    expect(run.roads.every(([a, b]) => inside(a) && inside(b))).toBe(true);
    expect(inside(run.start) && inside(run.target)).toBe(true);
    expect(run.streets.length).toBeGreaterThan(500);
    expect(STREETS_FROM).not.toEqual(STREETS_TO);
  });
});
