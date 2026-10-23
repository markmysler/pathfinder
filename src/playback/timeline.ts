import { zeroHeuristic, type Heuristic } from '../algorithms/heuristics';
import type { FrontierRule } from '../algorithms';
import type { Trace } from '../algorithms/trace';
import type { SearchEvent } from '../algorithms/types';
import { edgeRange, type Graph } from '../graph/graph';
import { haversineMeters } from '../graph/geo';
import { incomingRange, reverseIndex } from '../graph/reverse';

/** Frontier leave time for nodes that were never expanded. Exact in a Float32Array. */
export const NEVER = 2 ** 30;

/**
 * A search trace laid out for playback. Step t means "after t expansions": step 0 is the start,
 * with only the source in the frontier, and step `steps` is the end of the search.
 *
 * Everything the map draws is stamped with the step it appears at, so the renderer can upload it
 * once and show any moment by filtering on the step alone. Positions are [lon, lat] pairs.
 *
 * Sides are numbered 0 for forward and 1 for backward; one-way searches only have side 0.
 */
export interface Timeline extends FrontierEntries, Meetings {
  steps: number;
  /** Searched from both ends at once. */
  bidirectional: boolean;

  /** Per step (index 0 is the start): the node expanded and what the search knew about it. */
  expandedNode: Uint32Array;
  expandedSide: Uint8Array;
  expandedPosition: Float64Array;
  /** The cost from the side's start: from A going forward, to B going backward. */
  expandedCost: Float64Array;
  /** The side's estimate: to B going forward, from A going backward. */
  expandedEstimate: Float64Array;
  /** Roads the expansion looked along: out of the node going forward, into it going backward. */
  expandedDegree: Uint32Array;
  /** How many neighbours joined (or re-joined) the frontier during the step. */
  pushesAt: Uint32Array;
  /** Distinct nodes waiting in the frontier after the step, on both sides together. */
  frontierSizeAt: Uint32Array;
  /** How many of those wait on side 1, going backward from B. */
  frontierSizeAtB: Uint32Array;
  /** The largest frontier at any step up to and including this one. */
  frontierPeakAt: Uint32Array;

  /** Roads drawn as explored: one per push that came along an edge. */
  roadCount: number;
  roadFrom: Float64Array;
  roadTo: Float64Array;
  roadStep: Float32Array;
  roadSide: Uint8Array;

  /** Nodes that were ever in a side's frontier, with the steps they entered and first left it. */
  frontierCount: number;
  frontierNode: Uint32Array;
  frontierSide: Uint8Array;
  frontierPosition: Float64Array;
  frontierEnter: Float32Array;
  frontierLeave: Float32Array;

  route: { positions: Float64Array; cost: number; meters: number } | null;

  /** With live traffic: each entry's road as a share of free flow (NaN if no reading). */
  entryShare?: Float32Array;
  /** With live traffic: each entry's road length in metres (0 for where a side starts). */
  entryMeters?: Float32Array;
}

/** Each time a bidirectional search's sides met at a node and found a cheaper route. */
export interface Meetings {
  meetCount: number;
  /** The step whose expansion found it (0 if A and B are the same node). */
  meetStep: Uint32Array;
  /** The frontier entry whose push made it. */
  meetEntry: Uint32Array;
  meetNode: Uint32Array;
  meetPosition: Float64Array;
  /** The cost of the whole route through the node. */
  meetCost: Float64Array;
  /** What the search minimises along it: the cost, or for BFS the number of roads. */
  meetLength: Float64Array;
}

/** The latest meeting found by `step`, as an index into the meetings; -1 if none yet. */
export function meetingAt(meetings: Pick<Meetings, 'meetCount' | 'meetStep'>, step: number) {
  let low = 0;
  let high = meetings.meetCount;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (meetings.meetStep[mid]! <= step) low = mid + 1;
    else high = mid;
  }
  return low - 1;
}

const sideOf = (event: { side?: string }) => (event.side === 'backward' ? 1 : 0);

/**
 * Every frontier entry, one per push and numbered in push order, so the frontier can be listed
 * at any step. An entry is waiting at step t if it entered by t, has not left, and is not stale.
 */
export interface FrontierEntries {
  frontierRule: FrontierRule;
  entryCount: number;
  entryNode: Uint32Array;
  entrySide: Uint8Array;
  /** The step that pushed it (0 for the source). */
  entryEnter: Uint32Array;
  /** The step that took it out: by expanding it, or by skipping it as outdated. NEVER if neither. */
  entryLeave: Uint32Array;
  /** From this step on it is outdated: a newer entry for its node, or its node expanded. */
  entryStale: Uint32Array;
  entryCost: Float64Array;
  /** The estimate of its side. */
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
  /** How many of those are on side 1. */
  outdatedAtB: Uint32Array;
}

function buildEntries(
  events: readonly SearchEvent[],
  heuristics: readonly [Heuristic, Heuristic],
  frontierRule: FrontierRule,
  steps: number,
  nodeCount: number,
): FrontierEntries {
  let entryCount = 0;
  for (const event of events) if (event.type === 'push') entryCount++;
  const entryNode = new Uint32Array(entryCount);
  const entrySide = new Uint8Array(entryCount);
  const entryEnter = new Uint32Array(entryCount);
  const entryLeave = new Uint32Array(entryCount).fill(NEVER);
  const entryStale = new Uint32Array(entryCount).fill(NEVER);
  const entryCost = new Float64Array(entryCount);
  const entryEstimate = new Float64Array(entryCount);
  const entryPriority = new Float64Array(entryCount);
  const entryPrevious = new Float64Array(entryCount);
  const expandedEntry = new Uint32Array(steps + 1);
  const leaveOrder = new Uint32Array(entryCount);
  // Per side and node: the newest entry still waiting and not stale (-1 if none), and its last
  // cost. Side 1's nodes come after side 0's.
  const open = new Int32Array(2 * nodeCount).fill(-1);
  const lastCost = new Float64Array(2 * nodeCount).fill(Infinity);

  let step = 0;
  let entry = 0;
  let left = 0;
  for (const event of events) {
    if (event.type === 'meet') continue;
    const side = sideOf(event);
    const { node } = event;
    const slot = side * nodeCount + node;
    if (event.type === 'push') {
      const older = open[slot]!;
      if (older >= 0) entryStale[older] = step;
      open[slot] = entry;
      entryNode[entry] = node;
      entrySide[entry] = side;
      entryEnter[entry] = step;
      entryCost[entry] = event.cost;
      entryEstimate[entry] = heuristics[side]!(node);
      entryPriority[entry] = event.priority ?? entry;
      entryPrevious[entry] = lastCost[slot]!;
      lastCost[slot] = Math.min(lastCost[slot]!, event.cost);
      entry++;
    } else if (event.type === 'pop') {
      step++;
      entryLeave[event.entry] = step;
      entryStale[event.entry] = NEVER;
      expandedEntry[step] = event.entry;
      if (open[slot] === event.entry) open[slot] = -1;
      leaveOrder[left++] = event.entry;
    } else {
      // Skips happen while the next step looks for a node to expand.
      entryLeave[event.entry] = step + 1;
      if (entryStale[event.entry] === NEVER) entryStale[event.entry] = step;
      if (open[slot] === event.entry) open[slot] = -1;
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
  const changeB = new Int32Array(steps + 2);
  for (let e = 0; e < entryCount; e++) {
    const stale = entryStale[e]!;
    if (stale === NEVER || stale > steps) continue;
    const counts = entrySide[e] ? [change, changeB] : [change];
    for (const c of counts) {
      c[stale]!++;
      c[Math.min(entryLeave[e]!, steps + 1)]!--;
    }
  }
  const outdatedAt = new Uint32Array(steps + 1);
  const outdatedAtB = new Uint32Array(steps + 1);
  for (let t = 0, count = 0, countB = 0; t <= steps; t++) {
    outdatedAt[t] = count += change[t]!;
    outdatedAtB[t] = countB += changeB[t]!;
  }

  return {
    frontierRule,
    entryCount,
    entryNode,
    entrySide,
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
    outdatedAtB,
  };
}

/**
 * `heuristic` is the forward estimate, to the target; `backwardHeuristic` is a bidirectional
 * search's estimate from the source.
 */
export function buildTimeline(
  graph: Graph,
  { events, result }: Trace,
  heuristic: Heuristic = zeroHeuristic,
  frontierRule: FrontierRule = 'priority',
  backwardHeuristic: Heuristic = zeroHeuristic,
): Timeline {
  let steps = 0;
  let roadCount = 0;
  let meetCount = 0;
  let bidirectional = false;
  for (const event of events) {
    if (event.type === 'pop') steps++;
    else if (event.type === 'push' && event.edge !== null) roadCount++;
    else if (event.type === 'meet') meetCount++;
    if (event.type !== 'meet' && event.side === 'backward') bidirectional = true;
  }
  const heuristics = [heuristic, backwardHeuristic] as const;
  const reverse = bidirectional ? reverseIndex(graph) : null;

  const expandedNode = new Uint32Array(steps + 1);
  const expandedSide = new Uint8Array(steps + 1);
  const expandedPosition = new Float64Array(2 * (steps + 1));
  const expandedCost = new Float64Array(steps + 1);
  const expandedEstimate = new Float64Array(steps + 1);
  const expandedDegree = new Uint32Array(steps + 1);
  const pushesAt = new Uint32Array(steps + 1);
  const roadFrom = new Float64Array(2 * roadCount);
  const roadTo = new Float64Array(2 * roadCount);
  const roadStep = new Float32Array(roadCount);
  const roadSide = new Uint8Array(roadCount);
  const meetStep = new Uint32Array(meetCount);
  const meetEntry = new Uint32Array(meetCount);
  const meetNode = new Uint32Array(meetCount);
  const meetPosition = new Float64Array(2 * meetCount);
  const meetCost = new Float64Array(meetCount);
  const meetLength = new Float64Array(meetCount);
  // Keyed by side * nodeCount + node, so each side has its own frontier.
  const enter = new Map<number, number>();
  const leave = new Map<number, number>();

  let step = 0;
  let road = 0;
  let meet = 0;
  let pushes = 0;
  for (const event of events) {
    if (event.type === 'meet') {
      meetStep[meet] = step;
      meetEntry[meet] = pushes - 1;
      meetNode[meet] = event.node;
      meetPosition[2 * meet] = graph.lon[event.node]!;
      meetPosition[2 * meet + 1] = graph.lat[event.node]!;
      meetCost[meet] = event.cost;
      meetLength[meet] = event.length;
      meet++;
      continue;
    }
    const side = sideOf(event);
    const key = side * graph.nodeCount + event.node;
    if (event.type === 'pop') {
      step++;
      const [start, end] = side
        ? incomingRange(reverse!, event.node)
        : edgeRange(graph, event.node);
      expandedNode[step] = event.node;
      expandedSide[step] = side;
      expandedPosition[2 * step] = graph.lon[event.node]!;
      expandedPosition[2 * step + 1] = graph.lat[event.node]!;
      expandedCost[step] = event.cost;
      expandedEstimate[step] = heuristics[side]!(event.node);
      expandedDegree[step] = end - start;
      if (!leave.has(key)) leave.set(key, step);
    } else if (event.type === 'push') {
      pushes++;
      if (!enter.has(key)) enter.set(key, step);
      if (event.edge === null) continue;
      // Going backward the edge leads out of the new node, so it was explored from its far end.
      const from = side ? graph.edgeTarget[event.edge]! : graph.edgeSource[event.edge]!;
      roadFrom[2 * road] = graph.lon[from]!;
      roadFrom[2 * road + 1] = graph.lat[from]!;
      roadTo[2 * road] = graph.lon[event.node]!;
      roadTo[2 * road + 1] = graph.lat[event.node]!;
      roadStep[road] = step;
      roadSide[road] = side;
      pushesAt[step]!++;
      road++;
    }
  }

  const frontierCount = enter.size;
  const frontierNode = new Uint32Array(frontierCount);
  const frontierSide = new Uint8Array(frontierCount);
  const frontierPosition = new Float64Array(2 * frontierCount);
  const frontierEnter = new Float32Array(frontierCount);
  const frontierLeave = new Float32Array(frontierCount);
  // Frontier size by step: +1 where a node enters, -1 where it leaves, then a running total.
  const change = new Int32Array(steps + 2);
  const changeB = new Int32Array(steps + 2);
  let i = 0;
  for (const [key, entered] of enter) {
    const left = leave.get(key) ?? NEVER;
    const node = key % graph.nodeCount;
    frontierNode[i] = node;
    frontierSide[i] = key >= graph.nodeCount ? 1 : 0;
    frontierPosition[2 * i] = graph.lon[node]!;
    frontierPosition[2 * i + 1] = graph.lat[node]!;
    frontierEnter[i] = entered;
    frontierLeave[i] = left;
    for (const c of frontierSide[i] ? [change, changeB] : [change]) {
      c[entered]!++;
      if (left <= steps) c[left]!--;
    }
    i++;
  }
  const frontierSizeAt = new Uint32Array(steps + 1);
  const frontierSizeAtB = new Uint32Array(steps + 1);
  const frontierPeakAt = new Uint32Array(steps + 1);
  for (let t = 0, size = 0, sizeB = 0, peak = 0; t <= steps; t++) {
    frontierSizeAt[t] = size += change[t]!;
    frontierSizeAtB[t] = sizeB += changeB[t]!;
    frontierPeakAt[t] = peak = Math.max(peak, size);
  }

  return {
    steps,
    bidirectional,
    expandedNode,
    expandedSide,
    expandedPosition,
    expandedCost,
    expandedEstimate,
    expandedDegree,
    pushesAt,
    frontierSizeAt,
    frontierSizeAtB,
    frontierPeakAt,
    roadCount,
    roadFrom,
    roadTo,
    roadStep,
    roadSide,
    frontierCount,
    frontierNode,
    frontierSide,
    frontierPosition,
    frontierEnter,
    frontierLeave,
    meetCount,
    meetStep,
    meetEntry,
    meetNode,
    meetPosition,
    meetCost,
    meetLength,
    route: result.found ? describeRoute(graph, result.path, result.cost) : null,
    ...buildEntries(events, heuristics, frontierRule, steps, graph.nodeCount),
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

/** For each frontier entry, in push order: the traffic on the road it came along, and its length. */
export function entryTraffic(
  graph: Graph,
  { events }: Trace,
  edgeTraffic: Float32Array,
): { entryShare: Float32Array; entryMeters: Float32Array } {
  const pushes = events.filter((event) => event.type === 'push');
  const entryShare = new Float32Array(pushes.length).fill(NaN);
  const entryMeters = new Float32Array(pushes.length);
  pushes.forEach(({ edge }, entry) => {
    if (edge === null) return;
    const a = graph.edgeSource[edge]!;
    const b = graph.edgeTarget[edge]!;
    entryShare[entry] = edgeTraffic[edge]!;
    entryMeters[entry] = haversineMeters(
      graph.lat[a]!,
      graph.lon[a]!,
      graph.lat[b]!,
      graph.lon[b]!,
    );
  });
  return { entryShare, entryMeters };
}
