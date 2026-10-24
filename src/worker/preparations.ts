import type { Preparation } from '../algorithms';
import type { Heuristic } from '../algorithms/heuristics';
import { climbEdges, contract, unpack, type Hierarchy } from '../algorithms/hierarchy';
import { chooseLandmarks, landmarkHeuristic, type Landmarks } from '../algorithms/landmarks';
import type { SearchEvent } from '../algorithms/types';
import type { Graph } from '../graph/graph';
import type { Timeline } from '../playback/timeline';

/** How preparing is getting on, for the loading panel. `nodes` is the size of the graph. */
export type PrepareProgress =
  | {
      kind: 'landmarks';
      done: number;
      total: number;
      nodes: number;
      /** Set once finished: how long choosing them took. */
      ms?: number;
      reused?: boolean;
    }
  | {
      kind: 'hierarchy';
      done: number;
      total: number;
      nodes: number;
      shortcuts: number;
      ms?: number;
      reused?: boolean;
    };

/** Something worked out over the whole graph: how long it took, and whether it was reused. */
export interface Made<T> {
  data: T;
  ms: number;
  reused: boolean;
}

export interface Prepared {
  landmarks?: Made<Landmarks>;
  hierarchy?: Made<Hierarchy>;
}

interface Kept {
  nodeCount: number;
  edgeCount: number;
  landmarks?: { data: Landmarks; ms: number };
  hierarchy?: { data: Hierarchy; ms: number };
}

/** Preparations kept in memory for reuse, the most recently used `limit` of them. */
export function preparationCache(limit = 2) {
  const kept = new Map<string, Kept>();
  return {
    get(key: string) {
      const found = kept.get(key);
      if (found) {
        kept.delete(key);
        kept.set(key, found);
      }
      return found;
    },
    set(key: string, value: Kept) {
      kept.delete(key);
      kept.set(key, value);
      while (kept.size > limit) kept.delete(kept.keys().next().value!);
    },
  };
}

export type PreparationCache = ReturnType<typeof preparationCache>;

interface PrepareOptions {
  /** Where the landmarks start looking from: the search's start. */
  source: number;
  /** Names the roads, such as the area, mode, objective and traffic snapshot. */
  key?: string;
  cache?: PreparationCache;
  onProgress?(progress: PrepareProgress): void;
}

/**
 * Works out what the chosen algorithms need before searching: ALT's landmarks, contraction
 * hierarchies' order and shortcuts. Whatever was already made for the same roads is reused.
 */
export function prepareGraph(
  graph: Graph,
  needs: readonly Preparation[],
  { source, key, cache, onProgress }: PrepareOptions,
): Prepared {
  const found = key === undefined ? undefined : cache?.get(key);
  const kept: Kept =
    found && found.nodeCount === graph.nodeCount && found.edgeCount === graph.edgeCount
      ? found
      : { nodeCount: graph.nodeCount, edgeCount: graph.edgeCount };
  const nodes = graph.nodeCount;
  const prepared: Prepared = {};

  if (needs.includes('landmarks')) {
    const reused = Boolean(kept.landmarks);
    if (!kept.landmarks) {
      const started = performance.now();
      const data = chooseLandmarks(graph, { from: source });
      kept.landmarks = { data, ms: performance.now() - started };
    }
    const { data, ms } = kept.landmarks;
    const total = data.nodes.length;
    onProgress?.({ kind: 'landmarks', done: total, total, nodes, ms, reused });
    prepared.landmarks = { data, ms, reused };
  }

  if (needs.includes('hierarchy')) {
    const reused = Boolean(kept.hierarchy);
    if (!kept.hierarchy) {
      const started = performance.now();
      const data = contract(graph, {
        onProgress: (done, total, shortcuts) =>
          onProgress?.({ kind: 'hierarchy', done, total, nodes, shortcuts }),
      });
      kept.hierarchy = { data, ms: performance.now() - started };
    }
    const { data, ms } = kept.hierarchy;
    const shortcuts = data.edgeCount - data.baseEdgeCount;
    onProgress?.({ kind: 'hierarchy', done: nodes, total: nodes, nodes, shortcuts, ms, reused });
    prepared.hierarchy = { data, ms, reused };
  }

  if (key !== undefined && (kept.landmarks || kept.hierarchy)) cache?.set(key, kept);
  return prepared;
}

/** ALT's landmarks, ready to draw: where each is, in the order chosen, and why. */
export interface LandmarkView {
  ms: number;
  reused: boolean;
  node: Uint32Array;
  /** [lon, lat] pairs. */
  position: Float64Array;
  /** The round trip to the nearest landmark before it, which made it the farthest. */
  spread: Float64Array;
}

export function landmarkView(
  graph: Graph,
  landmarks: Landmarks,
  ms: number,
  reused: boolean,
): LandmarkView {
  const node = landmarks.nodes.slice();
  const position = new Float64Array(2 * node.length);
  node.forEach((n, i) => {
    position[2 * i] = graph.lon[n]!;
    position[2 * i + 1] = graph.lat[n]!;
  });
  return { ms, reused, node, position, spread: landmarks.spread.slice() };
}

/** How ALT got the estimate at each step of its search, indexed by step like the timeline. */
export interface LandmarkSteps {
  /** The landmark behind the estimate; -1 where no landmark beat 0. */
  best: Int8Array;
  /** 0: the landmark lies beyond B. 1: it lies behind the node. */
  via: Uint8Array;
  /**
   * The two measured costs, the estimate being the first minus the second: here → L and
   * B → L when beyond B; L → B and L → here when behind.
   */
  first: Float64Array;
  second: Float64Array;
  /** Every landmark's bound at each step, `count` per step. */
  bounds: Float64Array;
  /** What the straight line would have guessed. */
  straight: Float64Array;
  /** The landmark that gave the estimate at the most steps; -1 if none did. */
  mostUsed: number;
}

export function landmarkSteps(
  timeline: Pick<Timeline, 'steps' | 'expandedNode'>,
  landmarks: Landmarks,
  target: number,
  straight: Heuristic,
): LandmarkSteps {
  const { steps } = timeline;
  const { nodeCount, from, to } = landmarks;
  const count = landmarks.nodes.length;
  const explain = landmarkHeuristic(landmarks, target).explain;
  const best = new Int8Array(steps + 1).fill(-1);
  const via = new Uint8Array(steps + 1);
  const first = new Float64Array(steps + 1);
  const second = new Float64Array(steps + 1);
  const bounds = new Float64Array((steps + 1) * count);
  const straightAt = new Float64Array(steps + 1);
  const tally = new Uint32Array(count);
  for (let step = 1; step <= steps; step++) {
    const node = timeline.expandedNode[step]!;
    const { landmark, via: side } = explain(node);
    straightAt[step] = straight(node);
    for (let i = 0; i < count; i++) {
      const row = i * nodeCount;
      // A landmark that can't reach, or be reached from, both ends gives no bound that way.
      const ahead = to[row + node]! - to[row + target]!;
      const behind = from[row + target]! - from[row + node]!;
      bounds[step * count + i] = Math.max(
        0,
        Number.isFinite(ahead) ? ahead : 0,
        Number.isFinite(behind) ? behind : 0,
      );
    }
    if (landmark === null) continue;
    tally[landmark]!++;
    best[step] = landmark;
    const row = landmark * nodeCount;
    if (side === 'to') {
      first[step] = to[row + node]!;
      second[step] = to[row + target]!;
    } else {
      via[step] = 1;
      first[step] = from[row + target]!;
      second[step] = from[row + node]!;
    }
  }
  let mostUsed = -1;
  tally.forEach((n, i) => {
    if (n > 0 && (mostUsed < 0 || n > tally[mostUsed]!)) mostUsed = i;
  });
  return { best, via, first, second, bounds, straight: straightAt, mostUsed };
}

/**
 * Contraction laid out for playback: step s is the s-th node taken out. Everything is in
 * contraction order, so the map can show any moment by filtering on the step alone.
 */
export interface ContractionReplay {
  steps: number;
  /** The graph's roads, before any shortcut. */
  roads: number;
  node: Uint32Array;
  /** [lon, lat] of each node, in contraction order. */
  position: Float64Array;
  /** Per contraction (index step − 1): ways through, roads taken away, neighbours gone. */
  ways: Uint32Array;
  degree: Uint32Array;
  gone: Uint32Array;
  /** Shortcuts made by the end of each step. */
  shortcutsBy: Uint32Array;
  shortcutCount: number;
  shortcutFrom: Uint32Array;
  shortcutTo: Uint32Array;
  /** [lon, lat, lon, lat] per shortcut: from, then to. */
  shortcutPosition: Float64Array;
  shortcutWeight: Float64Array;
  /** The step that made it. */
  shortcutStep: Float32Array;
  /** How many of the graph's own roads it stands for. */
  shortcutRoads: Uint32Array;
  /** Steps from this one on contract the most important nodes, left for last. */
  importantFrom: number;
}

/** The share of nodes drawn as the most important ones. */
const IMPORTANT_SHARE = 0.02;

export function contractionReplay(graph: Graph, h: Hierarchy): ContractionReplay {
  const steps = h.nodeCount;
  const position = new Float64Array(2 * steps);
  h.order.forEach((n, i) => {
    position[2 * i] = graph.lon[n]!;
    position[2 * i + 1] = graph.lat[n]!;
  });
  const shortcutCount = h.edgeCount - h.baseEdgeCount;
  const shortcutFrom = h.edgeFrom.slice(h.baseEdgeCount);
  const shortcutTo = h.edgeTo.slice(h.baseEdgeCount);
  const shortcutPosition = new Float64Array(4 * shortcutCount);
  const shortcutStep = new Float32Array(shortcutCount);
  const shortcutRoads = new Uint32Array(shortcutCount);
  for (let i = 0; i < shortcutCount; i++) {
    const [a, b] = [shortcutFrom[i]!, shortcutTo[i]!];
    shortcutPosition.set([graph.lon[a]!, graph.lat[a]!, graph.lon[b]!, graph.lat[b]!], 4 * i);
    shortcutStep[i] = h.rank[h.shortcutVia[i]!]! + 1;
    // A shortcut is two edges in a row, each a road or an earlier shortcut.
    const roads = (edge: number) =>
      edge < h.baseEdgeCount ? 1 : shortcutRoads[edge - h.baseEdgeCount]!;
    shortcutRoads[i] = roads(h.shortcutFirst[i]!) + roads(h.shortcutSecond[i]!);
  }
  return {
    steps,
    roads: h.baseEdgeCount,
    node: h.order.slice(),
    position,
    ways: h.contractWays.slice(),
    degree: h.contractDegree.slice(),
    gone: h.contractGone.slice(),
    shortcutsBy: h.shortcutsBy.slice(),
    shortcutCount,
    shortcutFrom,
    shortcutTo,
    shortcutPosition,
    shortcutWeight: h.edgeWeight.slice(h.baseEdgeCount),
    shortcutStep,
    shortcutRoads,
    importantFrom: Math.min(steps - 1, Math.floor(steps * (1 - IMPORTANT_SHARE))),
  };
}

/** The packed route a contraction hierarchies search climbed: its shortcuts and its roads. */
export interface ClimbSummary {
  /** Shortcuts it took. */
  shortcuts: number;
  /** The graph's own roads the route unpacks into. */
  roads: number;
  /** Roads in the longest shortcut it took. */
  longest: number;
}

export function climbSummary(events: readonly SearchEvent[], h: Hierarchy): ClimbSummary {
  const climb = climbEdges(events, h);
  let shortcuts = 0;
  let roads = 0;
  let longest = 0;
  for (const edge of climb) {
    const length = unpack(h, [edge]).length;
    roads += length;
    if (edge >= h.baseEdgeCount) {
      shortcuts++;
      longest = Math.max(longest, length);
    }
  }
  return { shortcuts, roads, longest };
}

/** The buffers in a replay, for moving rather than copying it to the page. */
export const replayBuffers = (replay: ContractionReplay): ArrayBufferView[] =>
  Object.values(replay).filter(ArrayBuffer.isView);
