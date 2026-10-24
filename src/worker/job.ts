import { algorithms, type AlgorithmId, type AlgorithmInfo, type Preparation } from '../algorithms';
import { straightLineHeuristic } from '../algorithms/heuristics';
import { hierarchyEdges } from '../algorithms/hierarchy';
import { landmarkHeuristic } from '../algorithms/landmarks';
import { runSearch, summarize, type SearchStats } from '../algorithms/trace';
import { searchArea, type BBox, type LatLon } from '../osm/area';
import type { Graph } from '../graph/graph';
import type { Objective, RoadNetwork } from '../osm/network';
import { nodeLabels, type NodeLabels } from '../osm/places';
import { prepareSearch, type PreparedSearch } from '../osm/prepare';
import type { TravelMode } from '../osm/roads';
import { buildTimeline, entryTraffic, type Timeline } from '../playback/timeline';
import type { TimedTraffic, TrafficSource } from '../traffic/fetch';
import { matchTraffic, trafficCoverage, type TrafficCoverage } from '../traffic/match';
import { trafficRoads, trafficStory, type TrafficRoads, type TrafficStory } from '../traffic/story';
import { TrafficError, type TrafficFailure, type TrafficProvider } from '../traffic/types';
import {
  climbSummary,
  contractionReplay,
  landmarkSteps,
  landmarkView,
  prepareGraph,
  replayBuffers,
  type ClimbSummary,
  type ContractionReplay,
  type LandmarkSteps,
  type LandmarkView,
  type PreparationCache,
  type Prepared,
  type PrepareProgress,
} from './preparations';

export interface JobRequest {
  start: LatLon;
  target: LatLon;
  mode: TravelMode;
  objective: Objective;
  /** Run in this order, all on the same roads between the same snapped points. */
  algorithms: AlgorithmId[];
  /** Multiplies A*'s estimate (weighted A*): above 1 it expands less but may miss the best route. */
  astarWeight?: number;
  /** The user's own traffic key, if they gave one. Used for driving only. */
  traffic?: TrafficSource;
}

export type Stage = 'download' | 'traffic' | 'graph' | 'prepare' | 'search';

/** Steps of a search worth recording to replay; Bellman-Ford can take millions more. */
export const STEP_LIMIT = 400_000;

/** Whether live traffic shaped the routes, and if not, why not. */
export type TrafficOutcome =
  | { status: 'off' }
  | ({
      status: 'live';
      provider: TrafficProvider;
      fetchedAt: number;
      /** Tiles that never arrived; their roads kept their usual speeds. */
      missingTiles: number;
      /** Car roads to draw as slow, jammed or closed. */
      slowRoads: TrafficRoads;
      /** How traffic changed the best route; missing if there is no route. */
      story?: TrafficStory;
    } & TrafficCoverage)
  | { status: 'failed'; provider: TrafficProvider; reason: TrafficFailure };

/** The Overpass server being tried, once the first one has failed. */
export interface ServerAttempt {
  host: string;
  /** 1-based position in the list of servers. */
  attempt: number;
}

export interface SnappedPoint extends LatLon {
  /** Distance from the requested point to the road it snapped to. */
  meters: number;
  /** The graph node it snapped to. */
  node: number;
}

/** One algorithm's search, ready to play back. */
export interface AlgorithmRun {
  algorithm: AlgorithmId;
  /** The weight on the estimate: A*'s setting, 1 for everything else. */
  weight: number;
  timeline: Timeline;
  stats: SearchStats;
  /** How long the search took here, in milliseconds, recording included. */
  searchMs: number;
  /** Set when the search was stopped at the step limit, before it finished. */
  limit?: StepLimitReached;
  /** ALT: how each step's estimate came from the landmarks. */
  landmarkSteps?: LandmarkSteps;
  /** Contraction hierarchies: the shortcuts its climbs took, and Dijkstra's steps for scale. */
  climb?: ClimbSummary & { dijkstra: number };
}

export interface StepLimitReached {
  /** Steps recorded. */
  steps: number;
  /** Steps the whole search took. */
  needed: number;
  /** Steps Dijkstra takes for the same route, for scale. */
  dijkstra: number;
}

/** Contraction hierarchies' preparation, ready to replay. */
export interface HierarchyView {
  ms: number;
  reused: boolean;
  shortcuts: number;
  replay: ContractionReplay;
}

/** What was worked out over the whole map before searching, for the algorithms that need it. */
export interface PreparationView {
  landmarks?: LandmarkView;
  hierarchy?: HierarchyView;
}

export interface JobResult {
  mode: TravelMode;
  objective: Objective;
  area: BBox;
  fromCache: boolean;
  snapped: { start: SnappedPoint; target: SnappedPoint };
  runs: AlgorithmRun[];
  /** Street names for the graph's nodes, shared by every run. */
  places: NodeLabels;
  traffic: TrafficOutcome;
  preparation: PreparationView;
}

export interface JobDeps {
  loadRoadNetwork(
    area: BBox,
    options: { signal?: AbortSignal; onAttempt?: (endpoint: string, index: number) => void },
  ): Promise<{ network: RoadNetwork; fromCache: boolean }>;
  /** Live traffic over the area, straight from the user's provider. */
  fetchTraffic?(
    source: TrafficSource,
    area: BBox,
    options: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void },
  ): Promise<TimedTraffic>;
  onProgress(stage: Stage, server?: ServerAttempt): void;
  /** How many pieces of traffic (TomTom's tiles, HERE's one answer) have arrived. */
  onTrafficProgress?(done: number, total: number): void;
  /** How preparing landmarks and shortcuts is getting on. */
  onPrepare?(progress: PrepareProgress): void;
  /** Keeps preparations for the next run on the same roads. */
  preparations?: PreparationCache;
  /** Steps recorded per search; defaults to STEP_LIMIT. */
  stepLimit?: number;
  signal?: AbortSignal;
}

const isAbort = (error: unknown) => (error as { name?: unknown } | null)?.name === 'AbortError';

/** Everything between "Run" and playable timelines: area, roads, graph, then each search. */
export async function runJob(request: JobRequest, deps: JobDeps): Promise<JobResult> {
  const { signal } = deps;
  if (request.algorithms.length === 0) throw new Error('Choose at least one algorithm.');
  const area = searchArea(request.start, request.target);
  // Traffic only changes cars' roads. It downloads alongside the roads, and a failure only means
  // routing with the usual speeds.
  const source = request.mode === 'car' ? request.traffic : undefined;
  const traffic =
    source && deps.fetchTraffic
      ? deps.fetchTraffic(source, area, { signal, onProgress: deps.onTrafficProgress }).then(
          (fetched) => ({ fetched }),
          (error: unknown) => ({ error }),
        )
      : undefined;
  deps.onProgress('download');
  const { network, fromCache } = await deps.loadRoadNetwork(area, {
    signal,
    onAttempt: (endpoint, index) => {
      if (index > 0)
        deps.onProgress('download', { host: new URL(endpoint).host, attempt: index + 1 });
    },
  });
  signal?.throwIfAborted();

  let outcome: TrafficOutcome = { status: 'off' };
  let segmentTraffic;
  let live: Omit<Extract<TrafficOutcome, { status: 'live' }>, 'story'> | undefined;
  if (source && traffic) {
    deps.onProgress('traffic');
    const answer = await traffic;
    signal?.throwIfAborted();
    if ('fetched' in answer) {
      const { readings, missingTiles, fetchedAt } = answer.fetched;
      segmentTraffic = matchTraffic(network, readings);
      const coverage = trafficCoverage(network, segmentTraffic);
      live = {
        status: 'live',
        provider: source.provider,
        fetchedAt,
        missingTiles,
        ...coverage,
        slowRoads: trafficRoads(network, segmentTraffic),
      };
    } else {
      if (isAbort(answer.error)) throw answer.error;
      const reason = answer.error instanceof TrafficError ? answer.error.reason : 'unavailable';
      outcome = { status: 'failed', provider: source.provider, reason };
    }
  }

  deps.onProgress('graph');
  const prepared = prepareSearch(network, request, segmentTraffic);
  signal?.throwIfAborted();
  const { graph, snapped, edgeTraffic } = prepared;
  const needs = [
    ...new Set(
      request.algorithms.flatMap((id) => {
        const { prepares } = algorithms[id] as AlgorithmInfo;
        return prepares ? [prepares] : [];
      }),
    ),
  ] as Preparation[];
  let made: Prepared = {};
  if (needs.length) {
    deps.onProgress('prepare');
    made = prepareGraph(graph, needs, {
      source: prepared.source,
      key: roadsKey(area, request, live?.fetchedAt),
      cache: deps.preparations,
      onProgress: deps.onPrepare,
    });
    signal?.throwIfAborted();
  }

  deps.onProgress('search');
  if (live) {
    const { mode, objective } = request;
    const story = trafficStory(
      network,
      prepared,
      prepared.source,
      prepared.target,
      mode,
      objective,
    );
    outcome = { ...live, story };
  }
  const limit = deps.stepLimit ?? STEP_LIMIT;
  const runs = request.algorithms.map((algorithm) => {
    signal?.throwIfAborted();
    const weight = algorithm === 'astar' ? (request.astarWeight ?? 1) : 1;
    return searchRun(algorithm, prepared, made, { weight, limit, edgeTraffic });
  });
  const at = ({ node, meters }: { node: number; meters: number }) => ({
    lat: graph.lat[node]!,
    lon: graph.lon[node]!,
    meters,
    node,
  });
  return {
    mode: request.mode,
    objective: request.objective,
    area,
    fromCache,
    snapped: { start: at(snapped.start), target: at(snapped.target) },
    runs,
    places: nodeLabels(network),
    traffic: outcome,
    preparation: preparationView(graph, made),
  };
}

/** What one search needs: the graph, its ends, and estimates both ways. */
type SearchSetup = Pick<
  PreparedSearch,
  'graph' | 'source' | 'target' | 'heuristic' | 'backwardHeuristic' | 'maxSpeed'
>;

/** Runs one algorithm on prepared roads and lays out what it did for playback. */
export function searchRun(
  algorithm: AlgorithmId,
  setup: SearchSetup,
  made: Prepared,
  {
    weight = 1,
    limit = STEP_LIMIT,
    edgeTraffic,
  }: { weight?: number; limit?: number; edgeTraffic?: Float32Array } = {},
): AlgorithmRun {
  const info: AlgorithmInfo = algorithms[algorithm];
  const { graph, heuristic, backwardHeuristic, target } = setup;
  const landmarks = info.prepares === 'landmarks' ? made.landmarks?.data : undefined;
  const hierarchy = info.prepares === 'hierarchy' ? made.hierarchy?.data : undefined;
  const search = {
    ...setup,
    heuristic: weight === 1 ? heuristic : (n: number) => weight * heuristic(n),
    landmarks,
    hierarchy,
  };
  const started = performance.now();
  const trace = runSearch(info.search, search, { maxSteps: limit });
  const searchMs = performance.now() - started;
  // The timeline keeps the plain estimate, which is what the inspector explains: for ALT, the
  // landmarks' estimate.
  const shown = landmarks ? landmarkHeuristic(landmarks, target) : heuristic;
  const timeline = buildTimeline(graph, trace, shown, info.frontier, backwardHeuristic, {
    edges: hierarchy && hierarchyEdges(hierarchy),
    exhaustive: info.exhaustive,
    stopped: Boolean(trace.stopped),
  });
  // Shortcuts have no traffic of their own, so contraction hierarchies' roads go without.
  if (edgeTraffic && !hierarchy) Object.assign(timeline, entryTraffic(graph, trace, edgeTraffic));
  const run: AlgorithmRun = {
    algorithm,
    weight,
    timeline,
    stats: summarize(trace.events),
    searchMs,
  };
  const dijkstraSteps = () =>
    summarize(runSearch(algorithms.dijkstra.search, setup).events).expanded;
  if (trace.stopped) {
    run.limit = { steps: timeline.steps, needed: trace.stopped.needed, dijkstra: dijkstraSteps() };
  }
  if (landmarks) {
    const straight = straightLineHeuristic(graph, target, setup.maxSpeed);
    run.landmarkSteps = landmarkSteps(timeline, landmarks, target, straight);
  }
  if (hierarchy)
    run.climb = { ...climbSummary(trace.events, hierarchy), dijkstra: dijkstraSteps() };
  return run;
}

/** Names the roads a preparation was made for: change any part and it no longer fits. */
const roadsKey = (area: BBox, { mode, objective }: JobRequest, trafficAt?: number) =>
  [area.south, area.west, area.north, area.east, mode, objective, trafficAt ?? 'usual'].join('|');

/** Preparations as the page draws them. */
export function preparationView(graph: Graph, made: Prepared): PreparationView {
  const view: PreparationView = {};
  if (made.landmarks) {
    const { data, ms, reused } = made.landmarks;
    view.landmarks = landmarkView(graph, data, ms, reused);
  }
  if (made.hierarchy) {
    const { data, ms, reused } = made.hierarchy;
    const replay = contractionReplay(graph, data);
    view.hierarchy = { ms, reused, shortcuts: replay.shortcutCount, replay };
  }
  return view;
}

/** The buffers behind every timeline, so posting the result moves rather than copies them. */
export function transferablesOf(result: JobResult): ArrayBuffer[] {
  const views: ArrayBufferView[] = result.runs.flatMap(({ timeline }) => {
    const own: ArrayBufferView[] = Object.values(timeline).filter(ArrayBuffer.isView);
    return timeline.route ? [...own, timeline.route.positions] : own;
  });
  views.push(result.places.nodeLabel);
  for (const run of result.runs) {
    if (run.landmarkSteps)
      views.push(...Object.values(run.landmarkSteps).filter(ArrayBuffer.isView));
  }
  const { landmarks, hierarchy } = result.preparation;
  if (landmarks) views.push(landmarks.node, landmarks.position, landmarks.spread);
  if (hierarchy) views.push(...replayBuffers(hierarchy.replay));
  if (result.traffic.status === 'live') {
    const { slowRoads, story } = result.traffic;
    views.push(slowRoads.positions, slowRoads.share);
    if (story) views.push(story.clear.positions);
  }
  return views.map((view) => view.buffer as ArrayBuffer);
}
