import plazaDeMayo from '../osm/fixtures/plaza-de-mayo.overpass.json';
import { algorithms } from '../algorithms';
import { straightLineHeuristic } from '../algorithms/heuristics';
import { contract, contractionHierarchies, hierarchyEdges, unpack } from '../algorithms/hierarchy';
import { chooseLandmarks, landmarkHeuristic } from '../algorithms/landmarks';
import { runSearch } from '../algorithms/trace';
import { buildRoadNetwork, type OverpassResponse } from '../osm/network';
import { prepareSearch } from '../osm/prepare';
import { buildTimeline } from '../playback/timeline';
import { grid } from '../test/fixtures';
import {
  climbSummary,
  contractionReplay,
  landmarkSteps,
  landmarkView,
  preparationCache,
  prepareGraph,
  type PrepareProgress,
} from './preparations';

const network = buildRoadNetwork(plazaDeMayo as unknown as OverpassResponse);
const prepared = prepareSearch(network, {
  start: { lat: -34.6057, lon: -58.3755 },
  target: { lat: -34.6115, lon: -58.3685 },
  mode: 'car',
  objective: 'fastest',
});
const { graph } = prepared;

describe('prepareGraph', () => {
  it('works out only what the chosen algorithms need, timing each', () => {
    const none = prepareGraph(graph, [], { source: prepared.source });
    expect(none).toEqual({});
    const both = prepareGraph(graph, ['landmarks', 'hierarchy'], { source: prepared.source });
    expect(both.landmarks!.data.nodes).toHaveLength(8);
    expect(both.hierarchy!.data.nodeCount).toBe(graph.nodeCount);
    for (const made of [both.landmarks!, both.hierarchy!]) {
      expect(made.ms).toBeGreaterThanOrEqual(0);
      expect(made.reused).toBe(false);
    }
  });

  it('reports progress: landmarks at once, the hierarchy as nodes are contracted', () => {
    const progress: PrepareProgress[] = [];
    prepareGraph(graph, ['landmarks', 'hierarchy'], {
      source: prepared.source,
      onProgress: (p) => progress.push(p),
    });
    const landmarks = progress.filter((p) => p.kind === 'landmarks');
    const hierarchy = progress.filter((p) => p.kind === 'hierarchy');
    expect(landmarks.at(-1)).toMatchObject({ done: 8, total: 8, nodes: graph.nodeCount });
    expect(landmarks.at(-1)!.ms).toBeGreaterThanOrEqual(0);
    expect(hierarchy.length).toBeGreaterThan(2);
    expect(hierarchy.at(-1)).toMatchObject({ done: graph.nodeCount, total: graph.nodeCount });
    const shortcuts = hierarchy.map((p) => (p.kind === 'hierarchy' ? p.shortcuts : 0));
    expect(shortcuts).toEqual([...shortcuts].sort((a, b) => a - b));
    expect(shortcuts.at(-1)).toBeGreaterThan(0);
  });

  it('reuses what it made for the same roads, saying so', () => {
    const cache = preparationCache();
    const first = prepareGraph(graph, ['hierarchy'], { source: 0, key: 'roads', cache });
    const progress: PrepareProgress[] = [];
    const again = prepareGraph(graph, ['landmarks', 'hierarchy'], {
      source: 0,
      key: 'roads',
      cache,
      onProgress: (p) => progress.push(p),
    });
    expect(again.hierarchy!.data).toBe(first.hierarchy!.data);
    expect(again.hierarchy!.reused).toBe(true);
    expect(again.hierarchy!.ms).toBe(first.hierarchy!.ms);
    // Landmarks were not made the first time, so they are made now, and kept as well.
    expect(again.landmarks!.reused).toBe(false);
    expect(progress.find((p) => p.kind === 'hierarchy')).toMatchObject({ reused: true });
    const third = prepareGraph(graph, ['landmarks'], { source: 0, key: 'roads', cache });
    expect(third.landmarks!.reused).toBe(true);
  });

  it('prepares again for other roads, or a graph that does not match', () => {
    const cache = preparationCache();
    prepareGraph(graph, ['landmarks'], { source: 0, key: 'roads', cache });
    expect(
      prepareGraph(graph, ['landmarks'], { source: 0, key: 'other', cache }).landmarks!.reused,
    ).toBe(false);
    const small = grid(3);
    expect(
      prepareGraph(small, ['landmarks'], { source: 0, key: 'roads', cache }).landmarks!.reused,
    ).toBe(false);
  });

  it('keeps only the most recent few', () => {
    const cache = preparationCache(2);
    for (const key of ['a', 'b', 'c'])
      prepareGraph(grid(3), ['landmarks'], { source: 0, key, cache });
    expect(
      prepareGraph(grid(3), ['landmarks'], { source: 0, key: 'a', cache }).landmarks!.reused,
    ).toBe(false);
    expect(
      prepareGraph(grid(3), ['landmarks'], { source: 0, key: 'c', cache }).landmarks!.reused,
    ).toBe(true);
  });
});

describe('landmarkView', () => {
  it('places the landmarks, in the order chosen, with how far apart each was', () => {
    const landmarks = chooseLandmarks(graph, { from: prepared.source });
    const view = landmarkView(graph, landmarks, 12, true);
    expect(view).toMatchObject({ ms: 12, reused: true });
    expect([...view.node]).toEqual([...landmarks.nodes]);
    expect([...view.spread]).toEqual([...landmarks.spread]);
    const first = landmarks.nodes[0]!;
    expect([view.position[0], view.position[1]]).toEqual([graph.lon[first], graph.lat[first]]);
  });
});

describe('landmarkSteps', () => {
  const landmarks = chooseLandmarks(graph, { from: prepared.source });
  const heuristic = landmarkHeuristic(landmarks, prepared.target);
  const trace = runSearch(algorithms.alt.search, { ...prepared, landmarks });
  const timeline = buildTimeline(graph, trace, heuristic);
  const straight = straightLineHeuristic(graph, prepared.target, prepared.maxSpeed);
  const steps = landmarkSteps(timeline, landmarks, prepared.target, straight);

  it('says, for every step, which landmark gave the estimate and from which two costs', () => {
    for (let step = 1; step <= timeline.steps; step++) {
      const node = timeline.expandedNode[step]!;
      const { estimate, landmark, via } = heuristic.explain(node);
      expect(steps.best[step]).toBe(landmark ?? -1);
      expect(timeline.expandedEstimate[step]).toBeCloseTo(estimate, 9);
      if (landmark === null) continue;
      expect(steps.via[step]).toBe(via === 'to' ? 0 : 1);
      expect(steps.first[step]! - steps.second[step]!).toBeCloseTo(estimate, 6);
    }
  });

  it('keeps every landmark’s bound, the largest being the estimate, and the straight line', () => {
    const count = landmarks.nodes.length;
    for (let step = 1; step <= timeline.steps; step++) {
      const bounds = [...steps.bounds.subarray(step * count, (step + 1) * count)];
      expect(Math.max(0, ...bounds)).toBeCloseTo(timeline.expandedEstimate[step]!, 6);
      expect(steps.straight[step]).toBeCloseTo(straight(timeline.expandedNode[step]!), 9);
    }
  });

  it('counts which landmark gave the most estimates', () => {
    const tally = new Map<number, number>();
    for (let step = 1; step <= timeline.steps; step++) {
      const best = steps.best[step]!;
      if (best >= 0) tally.set(best, (tally.get(best) ?? 0) + 1);
    }
    const most = Math.max(...tally.values());
    expect(tally.get(steps.mostUsed)).toBe(most);
  });
});

describe('contractionReplay', () => {
  const h = contract(graph);
  const replay = contractionReplay(graph, h);

  it('has a step per contracted node, in contraction order, with where it is', () => {
    expect(replay.steps).toBe(graph.nodeCount);
    expect([...replay.node]).toEqual([...h.order]);
    const last = h.order[graph.nodeCount - 1]!;
    expect(replay.position[2 * (graph.nodeCount - 1)]).toBe(graph.lon[last]);
    expect(replay.roads).toBe(graph.edgeCount);
  });

  it('stamps each shortcut with the step that made it', () => {
    expect(replay.shortcutCount).toBe(h.edgeCount - h.baseEdgeCount);
    for (let i = 0; i < replay.shortcutCount; i++) {
      const via = h.shortcutVia[i]!;
      expect(replay.shortcutStep[i]).toBe(h.rank[via]! + 1);
      const edge = h.baseEdgeCount + i;
      expect(replay.shortcutFrom[i]).toBe(h.edgeFrom[edge]);
      expect(replay.shortcutTo[i]).toBe(h.edgeTo[edge]);
      expect(replay.shortcutPosition[4 * i]).toBe(graph.lon[h.edgeFrom[edge]!]);
      expect(replay.shortcutPosition[4 * i + 3]).toBe(graph.lat[h.edgeTo[edge]!]);
      expect(replay.shortcutRoads[i]).toBe(unpack(h, [edge]).length);
    }
    expect([...replay.shortcutsBy]).toEqual([...h.shortcutsBy]);
  });

  it('marks the most important nodes, those contracted last', () => {
    expect(replay.importantFrom).toBeLessThan(replay.steps);
    expect(replay.importantFrom).toBeGreaterThan(replay.steps * 0.9);
  });
});

describe('climbSummary', () => {
  it('counts the shortcuts the climbs took and the roads they unpack into', () => {
    const h = contract(graph);
    const trace = runSearch(contractionHierarchies, { ...prepared, hierarchy: h });
    const timeline = buildTimeline(graph, trace, undefined, 'priority', undefined, {
      edges: hierarchyEdges(h),
    });
    const summary = climbSummary(trace.events, h);
    expect(trace.result.found).toBe(true);
    if (!trace.result.found) return;
    expect(summary.roads).toBe(trace.result.edges.length);
    expect(summary.roads).toBe(timeline.route!.positions.length / 2 - 1);
    expect(summary.shortcuts).toBeGreaterThan(0);
    expect(summary.longest).toBeGreaterThanOrEqual(2);
  });
});
