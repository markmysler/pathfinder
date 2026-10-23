import { zeroHeuristic, type Heuristic } from '../algorithms/heuristics';
import type { FrontierRule } from '../algorithms';
import type { Trace } from '../algorithms/trace';
import type { SearchEvent } from '../algorithms/types';
import { edgeRange, type Graph } from '../graph/graph';
import { haversineMeters } from '../graph/geo';

/** Frontier leave time for nodes that were never expanded. Exact in a Float32Array. */
export const NEVER = 2 ** 30;

/**
 * A search trace laid out for playback. Step t means "after t expansions": step 0 is the start,
 * with only the source in the frontier, and step `steps` is the end of the search.
 *
 * Everything the map draws is stamped with the step it appears at, so the renderer can upload it
 * once and show any moment by filtering on the step alone. Positions are [lon, lat] pairs.
 */
export interface Timeline extends FrontierEntries {
  steps: number;

  /** Per step (index 0 is the start): the node expanded and what the search knew about it. */
  expandedNode: Uint32Array;
  expandedPosition: Float64Array;
  expandedCost: Float64Array;
  expandedEstimate: Float64Array;
  expandedDegree: Uint32Array;
  /** How many neighbours joined (or re-joined) the frontier during the step. */
  pushesAt: Uint32Array;
  /** Distinct nodes waiting in the frontier after the step. */
  frontierSizeAt: Uint32Array;
  /** The largest frontier at any step up to and including this one. */
  frontierPeakAt: Uint32Array;

  /** Roads drawn as explored: one per push that came along an edge. */
  roadCount: number;
  roadFrom: Float64Array;
  roadTo: Float64Array;
  roadStep: Float32Array;

  /** Nodes that were ever in the frontier, with the steps they entered and first left it. */
  frontierCount: number;
  frontierNode: Uint32Array;
  frontierPosition: Float64Array;
  frontierEnter: Float32Array;
  frontierLeave: Float32Array;

  route: { positions: Float64Array; cost: number; meters: number } | null;
}

/**
 * Every frontier entry, one per push and numbered in push order, so the frontier can be listed
 * at any step. An entry is waiting at step t if it entered by t, has not left, and is not stale.
 */
export interface FrontierEntries {
  frontierRule: FrontierRule;
  entryCount: number;
  entryNode: Uint32Array;
  /** The step that pushed it (0 for the source). */
  entryEnter: Uint32Array;
  /** The step that took it out: by expanding it, or by skipping it as outdated. NEVER if neither. */
  entryLeave: Uint32Array;
  /** From this step on it is outdated: a newer entry for its node, or its node expanded. */
  entryStale: Uint32Array;
  entryCost: Float64Array;
  entryEstimate: Float64Array;
  /** What the frontier orders it by; the push number for queues and stacks. */
  entryPriority: Float64Array;
  /** The cheapest cost known for its node before this push; Infinity if it is the first. */
  entryPrevious: Float64Array;
  /** The entry each step expanded. */
  expandedEntry: Uint32Array;
  /** Entries in the order they leave, then those that never do, in the order they would. */
  leaveOrder: Uint32Array;
  /** How many entries have left by each step: where leaveOrder's waiting entries begin. */
  leftBy: Uint32Array;
  /** Outdated entries still in the frontier after each step. */
  outdatedAt: Uint32Array;
}

function buildEntries(
  events: readonly SearchEvent[],
  heuristic: Heuristic,
  frontierRule: FrontierRule,
  steps: number,
  nodeCount: number,
): FrontierEntries {
  let entryCount = 0;
  for (const event of events) if (event.type === 'push') entryCount++;
  const entryNode = new Uint32Array(entryCount);
  const entryEnter = new Uint32Array(entryCount);
  const entryLeave = new Uint32Array(entryCount).fill(NEVER);
  const entryStale = new Uint32Array(entryCount).fill(NEVER);
  const entryCost = new Float64Array(entryCount);
  const entryEstimate = new Float64Array(entryCount);
  const entryPriority = new Float64Array(entryCount);
  const entryPrevious = new Float64Array(entryCount);
  const expandedEntry = new Uint32Array(steps + 1);
  const leaveOrder = new Uint32Array(entryCount);
  // Per node: the newest entry still waiting and not stale (-1 if none), and its last cost.
  const open = new Int32Array(nodeCount).fill(-1);
  const lastCost = new Float64Array(nodeCount).fill(Infinity);

  let step = 0;
  let entry = 0;
  let left = 0;
  for (const event of events) {
    const { node } = event;
    if (event.type === 'push') {
      const older = open[node]!;
      if (older >= 0) entryStale[older] = step;
      open[node] = entry;
      entryNode[entry] = node;
      entryEnter[entry] = step;
      entryCost[entry] = event.cost;
      entryEstimate[entry] = heuristic(node);
      entryPriority[entry] = event.priority ?? entry;
      entryPrevious[entry] = lastCost[node]!;
      lastCost[node] = Math.min(lastCost[node]!, event.cost);
      entry++;
    } else if (event.type === 'pop') {
      step++;
      entryLeave[event.entry] = step;
      entryStale[event.entry] = NEVER;
      expandedEntry[step] = event.entry;
      if (open[node] === event.entry) open[node] = -1;
      leaveOrder[left++] = event.entry;
    } else {
      // Skips happen while the next step looks for a node to expand.
      entryLeave[event.entry] = step + 1;
      if (entryStale[event.entry] === NEVER) entryStale[event.entry] = step;
      if (open[node] === event.entry) open[node] = -1;
      leaveOrder[left++] = event.entry;
    }
  }

  // Entries that never left, in the order the frontier would have handed them out.
  const waiting: number[] = [];
  for (let e = 0; e < entryCount; e++) if (entryLeave[e] === NEVER) waiting.push(e);
  if (frontierRule === 'stack') waiting.reverse();
  else if (frontierRule === 'priority') {
    waiting.sort((a, b) => entryPriority[a]! - entryPriority[b]! || a - b);
  }
  leaveOrder.set(waiting, left);

  const leftBy = new Uint32Array(steps + 1);
  for (let t = 0, i = 0; t <= steps; t++) {
    while (i < left && entryLeave[leaveOrder[i]!]! <= t) i++;
    leftBy[t] = i;
  }

  const change = new Int32Array(steps + 2);
  for (let e = 0; e < entryCount; e++) {
    const stale = entryStale[e]!;
    if (stale === NEVER || stale > steps) continue;
    change[stale]!++;
    change[Math.min(entryLeave[e]!, steps + 1)]!--;
  }
  const outdatedAt = new Uint32Array(steps + 1);
  for (let t = 0, count = 0; t <= steps; t++) outdatedAt[t] = count += change[t]!;

  return {
    frontierRule,
    entryCount,
    entryNode,
    entryEnter,
    entryLeave,
    entryStale,
    entryCost,
    entryEstimate,
    entryPriority,
    entryPrevious,
    expandedEntry,
    leaveOrder,
    leftBy,
    outdatedAt,
  };
}

export function buildTimeline(
  graph: Graph,
  { events, result }: Trace,
  heuristic: Heuristic = zeroHeuristic,
  frontierRule: FrontierRule = 'priority',
): Timeline {
  let steps = 0;
  let roadCount = 0;
  for (const event of events) {
    if (event.type === 'pop') steps++;
    else if (event.type === 'push' && event.edge !== null) roadCount++;
  }

  const expandedNode = new Uint32Array(steps + 1);
  const expandedPosition = new Float64Array(2 * (steps + 1));
  const expandedCost = new Float64Array(steps + 1);
  const expandedEstimate = new Float64Array(steps + 1);
  const expandedDegree = new Uint32Array(steps + 1);
  const pushesAt = new Uint32Array(steps + 1);
  const roadFrom = new Float64Array(2 * roadCount);
  const roadTo = new Float64Array(2 * roadCount);
  const roadStep = new Float32Array(roadCount);
  const enter = new Map<number, number>();
  const leave = new Map<number, number>();

  let step = 0;
  let road = 0;
  for (const event of events) {
    if (event.type === 'pop') {
      step++;
      const [start, end] = edgeRange(graph, event.node);
      expandedNode[step] = event.node;
      expandedPosition[2 * step] = graph.lon[event.node]!;
      expandedPosition[2 * step + 1] = graph.lat[event.node]!;
      expandedCost[step] = event.cost;
      expandedEstimate[step] = heuristic(event.node);
      expandedDegree[step] = end - start;
      if (!leave.has(event.node)) leave.set(event.node, step);
    } else if (event.type === 'push') {
      if (!enter.has(event.node)) enter.set(event.node, step);
      if (event.edge === null) continue;
      const from = graph.edgeSource[event.edge]!;
      roadFrom[2 * road] = graph.lon[from]!;
      roadFrom[2 * road + 1] = graph.lat[from]!;
      roadTo[2 * road] = graph.lon[event.node]!;
      roadTo[2 * road + 1] = graph.lat[event.node]!;
      roadStep[road] = step;
      pushesAt[step]!++;
      road++;
    }
  }

  const frontierCount = enter.size;
  const frontierNode = new Uint32Array(frontierCount);
  const frontierPosition = new Float64Array(2 * frontierCount);
  const frontierEnter = new Float32Array(frontierCount);
  const frontierLeave = new Float32Array(frontierCount);
  // Frontier size by step: +1 where a node enters, -1 where it leaves, then a running total.
  const change = new Int32Array(steps + 2);
  let i = 0;
  for (const [node, entered] of enter) {
    const left = leave.get(node) ?? NEVER;
    frontierNode[i] = node;
    frontierPosition[2 * i] = graph.lon[node]!;
    frontierPosition[2 * i + 1] = graph.lat[node]!;
    frontierEnter[i] = entered;
    frontierLeave[i] = left;
    change[entered]!++;
    if (left <= steps) change[left]!--;
    i++;
  }
  const frontierSizeAt = new Uint32Array(steps + 1);
  const frontierPeakAt = new Uint32Array(steps + 1);
  for (let t = 0, size = 0, peak = 0; t <= steps; t++) {
    frontierSizeAt[t] = size += change[t]!;
    frontierPeakAt[t] = peak = Math.max(peak, size);
  }

  return {
    steps,
    expandedNode,
    expandedPosition,
    expandedCost,
    expandedEstimate,
    expandedDegree,
    pushesAt,
    frontierSizeAt,
    frontierPeakAt,
    roadCount,
    roadFrom,
    roadTo,
    roadStep,
    frontierCount,
    frontierNode,
    frontierPosition,
    frontierEnter,
    frontierLeave,
    route: result.found ? describeRoute(graph, result.path, result.cost) : null,
    ...buildEntries(events, heuristic, frontierRule, steps, graph.nodeCount),
  };
}

function describeRoute(graph: Graph, path: number[], cost: number) {
  const positions = new Float64Array(2 * path.length);
  let meters = 0;
  path.forEach((node, i) => {
    positions[2 * i] = graph.lon[node]!;
    positions[2 * i + 1] = graph.lat[node]!;
    const next = path[i + 1];
    if (next !== undefined) {
      meters += haversineMeters(
        graph.lat[node]!,
        graph.lon[node]!,
        graph.lat[next]!,
        graph.lon[next]!,
      );
    }
  });
  return { positions, cost, meters };
}

/** How many explored roads are drawn at a step: those stamped with it or earlier. */
export function roadsExploredBy(timeline: Pick<Timeline, 'roadStep' | 'roadCount'>, step: number) {
  // Roads are stamped in push order, so their steps never decrease: binary search the boundary.
  let low = 0;
  let high = timeline.roadCount;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (timeline.roadStep[mid]! <= step) low = mid + 1;
    else high = mid;
  }
  return low;
}
