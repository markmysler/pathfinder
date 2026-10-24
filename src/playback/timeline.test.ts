import fc from 'fast-check';
import { algorithms } from '../algorithms';
import { straightLineHeuristic } from '../algorithms/heuristics';
import { runSearch, type Trace } from '../algorithms/trace';
import { edgeRange, type Graph } from '../graph/graph';
import { incomingRange, reverseIndex } from '../graph/reverse';
import { haversineMeters } from '../graph/geo';
import { randomGeoProblem } from '../test/arbitraries';
import { solve } from '../test/timelines';
import { binaryTree, grid, undirectedGraphFrom } from '../test/fixtures';
import { contract, hierarchyEdges } from '../algorithms/hierarchy';
import { buildTimeline, entryTraffic, meetingAt, NEVER, roadsExploredBy } from './timeline';

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
        const t = solve(p, a).timeline;
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

describe('buildTimeline for a bidirectional search', () => {
  const graph = grid(6);
  const [source, target] = [12, 17]; // across the middle row
  const heuristic = straightLineHeuristic(graph, target);
  const backwardHeuristic = straightLineHeuristic(graph, source);
  const trace = runSearch(algorithms.biastar.search, {
    graph,
    source,
    target,
    heuristic,
    backwardHeuristic,
  });
  const timeline = buildTimeline(graph, trace, heuristic, 'priority', backwardHeuristic);
  const sideOf = (side: string | undefined) => (side === 'backward' ? 1 : 0);

  it('says it is bidirectional, unlike a one-way search', () => {
    expect(timeline.bidirectional).toBe(true);
    const oneWay = runSearch(algorithms.astar.search, { graph, source, target, heuristic });
    expect(buildTimeline(graph, oneWay, heuristic).bidirectional).toBe(false);
  });

  it('records which side made each step, with that side’s estimate and roads', () => {
    expect(timeline.expandedSide[0]).toBe(0);
    pops(trace).forEach((pop, i) => {
      const step = i + 1;
      const backward = pop.side === 'backward';
      expect(timeline.expandedSide[step]).toBe(sideOf(pop.side));
      expect(timeline.expandedEstimate[step]).toBe(
        backward ? backwardHeuristic(pop.node) : heuristic(pop.node),
      );
      const [start, end] = backward
        ? incomingRange(reverseIndex(graph), pop.node)
        : edgeRange(graph, pop.node);
      expect(timeline.expandedDegree[step]).toBe(end - start);
    });
    expect(new Set(timeline.expandedSide.subarray(1))).toEqual(new Set([0, 1]));
  });

  it('draws backward roads from the node they were explored from', () => {
    let road = 0;
    for (const event of trace.events) {
      if (event.type !== 'push' || event.edge === null) continue;
      const backward = event.side === 'backward';
      const from = backward ? graph.edgeTarget[event.edge]! : graph.edgeSource[event.edge]!;
      expect(timeline.roadSide[road]).toBe(sideOf(event.side));
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
  });

  it('keeps each side’s frontier apart, so a node can wait in both', () => {
    const entered = new Map<string, number>();
    const left = new Map<string, number>();
    let step = 0;
    for (const event of trace.events) {
      if (event.type === 'meet') continue;
      const key = `${sideOf(event.side)} ${event.node}`;
      if (event.type === 'pop') {
        step++;
        if (!left.has(key)) left.set(key, step);
      }
      if (event.type === 'push' && !entered.has(key)) entered.set(key, step);
    }
    expect(timeline.frontierCount).toBe(entered.size);
    for (let i = 0; i < timeline.frontierCount; i++) {
      const key = `${timeline.frontierSide[i]} ${timeline.frontierNode[i]}`;
      expect(timeline.frontierEnter[i]).toBe(entered.get(key));
      expect(timeline.frontierLeave[i]).toBe(left.get(key) ?? NEVER);
    }
    expect(timeline.frontierSizeAt[0]).toBe(2);
  });

  it('marks each frontier entry with its side and that side’s estimate', () => {
    const pushes = trace.events.filter((e) => e.type === 'push');
    expect(timeline.entryCount).toBe(pushes.length);
    pushes.forEach((push, entry) => {
      expect(timeline.entrySide[entry]).toBe(sideOf(push.side));
      expect(timeline.entryEstimate[entry]).toBe(
        push.side === 'backward' ? backwardHeuristic(push.node) : heuristic(push.node),
      );
    });
  });

  it('stamps every meeting with the step that found it', () => {
    const expected: [number, number, number, number][] = [];
    let step = 0;
    for (const event of trace.events) {
      if (event.type === 'pop') step++;
      if (event.type === 'meet') expected.push([step, event.node, event.cost, event.length]);
    }
    expect(expected.length).toBeGreaterThan(0);
    expect(timeline.meetCount).toBe(expected.length);
    expected.forEach(([at, node, cost, length], i) => {
      expect(timeline.meetStep[i]).toBe(at);
      expect(timeline.meetNode[i]).toBe(node);
      expect(timeline.meetCost[i]).toBe(cost);
      expect(timeline.meetLength[i]).toBe(length);
      expect([...timeline.meetPosition.subarray(2 * i, 2 * i + 2)]).toEqual([
        graph.lon[node],
        graph.lat[node],
      ]);
    });
  });

  it('ends with the route through the last meeting', () => {
    const last = timeline.meetCount - 1;
    expect(timeline.route!.cost).toBeCloseTo(timeline.meetCost[last]!, 6);
  });
});

describe('meetingAt', () => {
  const meetings = {
    meetCount: 3,
    meetStep: Uint32Array.from([4, 4, 9]),
  };

  it('is the latest meeting found by a step, or -1 before the sides meet', () => {
    expect(meetingAt(meetings, 0)).toBe(-1);
    expect(meetingAt(meetings, 3)).toBe(-1);
    expect(meetingAt(meetings, 4)).toBe(1);
    expect(meetingAt(meetings, 8)).toBe(1);
    expect(meetingAt(meetings, 9)).toBe(2);
    expect(meetingAt(meetings, 100)).toBe(2);
  });

  it('is -1 for a one-way search, which never meets', () => {
    expect(meetingAt({ meetCount: 0, meetStep: new Uint32Array(0) }, 5)).toBe(-1);
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

describe('entryTraffic', () => {
  it('gives each frontier entry the traffic and length of the road it came along', () => {
    const graph = grid(3);
    const edgeTraffic = new Float32Array(graph.edgeCount).map((_, e) => (e % 2 ? 0.5 : NaN));
    const trace = runSearch(algorithms.dijkstra.search, { graph, source: 0, target: 8 });
    const { entryShare, entryMeters } = entryTraffic(graph, trace, edgeTraffic);
    const pushes = trace.events.filter((e) => e.type === 'push');
    expect(entryShare).toHaveLength(pushes.length);
    pushes.forEach((push, i) => {
      if (push.edge === null) {
        expect(entryShare[i]).toBeNaN();
        expect(entryMeters[i]).toBe(0);
        return;
      }
      const e = push.edge;
      if (Number.isNaN(edgeTraffic[e]!)) expect(entryShare[i]).toBeNaN();
      else expect(entryShare[i]).toBe(edgeTraffic[e]);
      const a = graph.edgeSource[e]!;
      const b = graph.edgeTarget[e]!;
      expect(entryMeters[i]).toBeCloseTo(
        haversineMeters(graph.lat[a]!, graph.lon[a]!, graph.lat[b]!, graph.lon[b]!),
        2,
      );
    });
  });
});

describe('buildTimeline for contraction hierarchies', () => {
  // A line 0 – 1 – 2 – 3 – 4, contracted middle-out so the search climbs shortcuts.
  const graph = undirectedGraphFrom([
    [0, 1, 1],
    [1, 2, 1],
    [2, 3, 1],
    [3, 4, 1],
  ]);
  const hierarchy = contract(graph, { order: [1, 3, 2, 0, 4] });
  const trace = runSearch(algorithms.ch.search, { graph, source: 0, target: 4, hierarchy });
  const timeline = buildTimeline(graph, trace, undefined, 'priority', undefined, {
    edges: hierarchyEdges(hierarchy),
  });

  it('draws each road it explored between the ends of the edge it took, shortcuts included', () => {
    const pushes = trace.events.filter((e) => e.type === 'push' && e.edge !== null);
    expect(timeline.roadCount).toBe(pushes.length);
    pushes.forEach((push, i) => {
      if (push.type !== 'push') return;
      const edge = push.edge!;
      const [from, to] =
        push.side === 'backward'
          ? [hierarchy.edgeTo[edge]!, hierarchy.edgeFrom[edge]!]
          : [hierarchy.edgeFrom[edge]!, hierarchy.edgeTo[edge]!];
      expect([...timeline.roadFrom.subarray(2 * i, 2 * i + 2)]).toEqual([
        graph.lon[from],
        graph.lat[from],
      ]);
      expect([...timeline.roadTo.subarray(2 * i, 2 * i + 2)]).toEqual([
        graph.lon[to],
        graph.lat[to],
      ]);
    });
    // Some explored road skips nodes: a shortcut.
    expect(pushes.some((p) => p.type === 'push' && p.edge! >= hierarchy.baseEdgeCount)).toBe(true);
  });

  it('counts the roads a step looked along as those going up from its node', () => {
    for (let step = 1; step <= timeline.steps; step++) {
      const node = timeline.expandedNode[step]!;
      const [first, end] = timeline.expandedSide[step]
        ? [hierarchy.downFirst[node]!, hierarchy.downFirst[node + 1]!]
        : [hierarchy.upFirst[node]!, hierarchy.upFirst[node + 1]!];
      expect(timeline.expandedDegree[step]).toBe(end - first);
    }
  });

  it('still draws the route along the graph’s own roads', () => {
    expect(timeline.route!.positions).toHaveLength(2 * 5);
  });
});

describe('buildTimeline for a search that does not stop at B', () => {
  const graph = grid(4);
  const trace = runSearch(algorithms.bellmanford.search, { graph, source: 0, target: 5 });

  it('says so, so B is not treated as the last step', () => {
    expect(buildTimeline(graph, trace).exhaustive).toBe(false);
    expect(
      buildTimeline(graph, trace, undefined, 'queue', undefined, { exhaustive: true }).exhaustive,
    ).toBe(true);
  });

  it('says when a search was stopped before it finished', () => {
    const half = { events: trace.events.slice(0, 20), result: { found: false as const } };
    const t = buildTimeline(graph, half, undefined, 'queue', undefined, { stopped: true });
    expect(t.stopped).toBe(true);
    expect(t.route).toBeNull();
    expect(buildTimeline(graph, trace).stopped).toBe(false);
  });
});
