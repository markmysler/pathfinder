import { streetLandmarks, streetSearch, STREETS_FROM, STREETS_TO } from './streets';

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

  it('draws a search from both ends, each road from the node it was explored from', () => {
    const dijkstra = streetSearch('dijkstra');
    const both = streetSearch('bidijkstra');
    expect(both.route!.cost).toBeCloseTo(dijkstra.route!.cost, 6);
    expect(both.expanded).toBeLessThan(dijkstra.expanded);
    const backward = both.roads.filter(([, , side]) => side === 1);
    expect(backward.length).toBeGreaterThan(0);
    // B's side starts at B, so its first roads lead away from it.
    expect(backward[0]![0]).toEqual(both.target);
    expect(both.roads.find(([, , side]) => side === 0)![0]).toEqual(both.start);
  });

  it('prepares for ALT and contraction hierarchies, drawing shortcuts from end to end', () => {
    const dijkstra = streetSearch('dijkstra');
    for (const id of ['alt', 'ch'] as const) {
      const run = streetSearch(id);
      expect(run.route!.cost).toBeCloseTo(dijkstra.route!.cost, 6);
      expect(run.expanded).toBeLessThan(dijkstra.expanded);
      for (const [a, b] of run.roads) expect([...a, ...b].every(Number.isFinite)).toBe(true);
    }
  });

  it('places ALT’s landmarks on the streets, and finds the one used most', () => {
    const { points, mostUsed, size } = streetLandmarks();
    expect(points).toHaveLength(8);
    expect(points.every(([x, y]) => x >= 0 && x <= size[0] && y >= 0 && y <= size[1])).toBe(true);
    expect(mostUsed).toBeGreaterThanOrEqual(0);
  });
});
