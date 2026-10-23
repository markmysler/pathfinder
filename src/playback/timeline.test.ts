import fc from 'fast-check';
import { algorithms } from '../algorithms';
import { straightLineHeuristic } from '../algorithms/heuristics';
import { runSearch, type Trace } from '../algorithms/trace';
import { edgeRange, type Graph } from '../graph/graph';
import { haversineMeters } from '../graph/geo';
import { randomGeoProblem } from '../test/arbitraries';
import { binaryTree, grid } from '../test/fixtures';
import { buildTimeline, NEVER, roadsExploredBy } from './timeline';

const pops = (trace: Trace) => trace.events.filter((e) => e.type === 'pop');

describe('buildTimeline', () => {
  const graph = grid(4);
  const heuristic = straightLineHeuristic(graph, 15);
  const trace = runSearch(algorithms.astar.search, { graph, source: 0, target: 15, heuristic });
  const timeline = buildTimeline(graph, trace, heuristic);

  it('has one step per expanded node', () => {
    expect(timeline.steps).toBe(pops(trace).length);
  });

  it('records each expansion: node, position, cost, estimate, roads and pushes', () => {
    pops(trace).forEach((pop, i) => {
      const step = i + 1;
      expect(timeline.expandedNode[step]).toBe(pop.node);
      expect(timeline.expandedCost[step]).toBe(pop.cost);
      expect(timeline.expandedEstimate[step]).toBe(heuristic(pop.node));
      const [start, end] = edgeRange(graph, pop.node);
      expect(timeline.expandedDegree[step]).toBe(end - start);
      expect(timeline.expandedPosition[2 * step]).toBe(graph.lon[pop.node]);
      expect(timeline.expandedPosition[2 * step + 1]).toBe(graph.lat[pop.node]);
    });
  });

  it('draws one explored road per push, stamped with the step that pushed it', () => {
    let step = 0;
    let road = 0;
    for (const event of trace.events) {
      if (event.type === 'pop') step++;
      if (event.type !== 'push' || event.edge === null) continue;
      const from = graph.edgeSource[event.edge]!;
      expect(timeline.roadStep[road]).toBe(step);
      expect([...timeline.roadFrom.subarray(2 * road, 2 * road + 2)]).toEqual([
        graph.lon[from],
        graph.lat[from],
      ]);
      expect([...timeline.roadTo.subarray(2 * road, 2 * road + 2)]).toEqual([
        graph.lon[event.node],
        graph.lat[event.node],
      ]);
      road++;
    }
    expect(timeline.roadCount).toBe(road);
    expect(timeline.pushesAt.reduce((a, b) => a + b, 0)).toBe(road);
  });

  it('knows when each node entered and left the frontier', () => {
    const entered = new Map<number, number>();
    const left = new Map<number, number>();
    let step = 0;
    for (const event of trace.events) {
      if (event.type === 'pop') {
        step++;
        if (!left.has(event.node)) left.set(event.node, step);
      }
      if (event.type === 'push' && !entered.has(event.node)) entered.set(event.node, step);
    }
    expect(timeline.frontierCount).toBe(entered.size);
    for (let i = 0; i < timeline.frontierCount; i++) {
      const node = timeline.frontierNode[i]!;
      expect(timeline.frontierEnter[i]).toBe(entered.get(node));
      expect(timeline.frontierLeave[i]).toBe(left.get(node) ?? NEVER);
    }
  });

  it('counts the frontier after every step, starting with just the source', () => {
    expect(timeline.frontierSizeAt[0]).toBe(1);
    for (let t = 0; t <= timeline.steps; t++) {
      let size = 0;
      for (let i = 0; i < timeline.frontierCount; i++) {
        if (timeline.frontierEnter[i]! <= t && t < timeline.frontierLeave[i]!) size++;
      }
      expect(timeline.frontierSizeAt[t]).toBe(size);
    }
  });

  it('keeps the largest frontier seen so far at every step', () => {
    let peak = 0;
    for (let t = 0; t <= timeline.steps; t++) {
      peak = Math.max(peak, timeline.frontierSizeAt[t]!);
      expect(timeline.frontierPeakAt[t]).toBe(peak);
    }
  });

  it('describes the route found, with its length in meters', () => {
    expect(trace.result.found).toBe(true);
    if (!trace.result.found) return;
    const route = timeline.route!;
    expect(route.cost).toBe(trace.result.cost);
    expect(route.positions.length).toBe(2 * trace.result.path.length);
    let meters = 0;
    trace.result.path.forEach((node, i) => {
      expect(route.positions[2 * i]).toBe(graph.lon[node]);
      expect(route.positions[2 * i + 1]).toBe(graph.lat[node]);
      const next = trace.result.found ? trace.result.path[i + 1] : undefined;
      if (next !== undefined) {
        meters += haversineMeters(
          graph.lat[node]!,
          graph.lon[node]!,
          graph.lat[next]!,
          graph.lon[next]!,
        );
      }
    });
    expect(route.meters).toBeCloseTo(meters, 6);
  });

  it('has no route when the search failed', () => {
    const tree: Graph = binaryTree();
    const failed = runSearch(algorithms.bfs.search, { graph: tree, source: 3, target: 0 });
    expect(buildTimeline(tree, failed).route).toBeNull();
  });

  it('stays consistent for every algorithm on random graphs', () => {
    fc.assert(
      fc.property(randomGeoProblem(), fc.constantFrom(...Object.values(algorithms)), (p, a) => {
        const h = straightLineHeuristic(p.graph, p.target);
        const t = buildTimeline(p.graph, runSearch(a.search, { ...p, heuristic: h }), h);
        for (let i = 0; i < t.roadCount; i++) {
          expect(t.roadStep[i]).toBeGreaterThanOrEqual(0);
          expect(t.roadStep[i]).toBeLessThanOrEqual(t.steps);
        }
        for (let i = 0; i < t.frontierCount; i++) {
          expect(t.frontierEnter[i]).toBeLessThan(t.frontierLeave[i]!);
        }
        expect(t.frontierSizeAt.length).toBe(t.steps + 1);
      }),
    );
  });
});

describe('roadsExploredBy', () => {
  it('counts the roads drawn up to and including a step', () => {
    const graph = grid(5);
    const h = straightLineHeuristic(graph, 24);
    const t = buildTimeline(
      graph,
      runSearch(algorithms.dijkstra.search, { graph, source: 0, target: 24 }),
      h,
    );
    for (const step of [0, 1, 2, Math.floor(t.steps / 2), t.steps]) {
      const expected = [...t.roadStep].filter((s) => s <= step).length;
      expect(roadsExploredBy(t, step)).toBe(expected);
    }
  });
});
