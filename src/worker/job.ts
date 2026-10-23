import { algorithms, type AlgorithmId } from '../algorithms';
import { runSearch, summarize, type SearchStats } from '../algorithms/trace';
import { searchArea, type BBox, type LatLon } from '../osm/area';
import type { Objective, RoadNetwork } from '../osm/network';
import { nodeLabels, type NodeLabels } from '../osm/places';
import { prepareSearch } from '../osm/prepare';
import type { TravelMode } from '../osm/roads';
import { buildTimeline, type Timeline } from '../playback/timeline';
import type { TimedTraffic, TrafficSource } from '../traffic/fetch';
import { matchTraffic, trafficCoverage, type TrafficCoverage } from '../traffic/match';
import { TrafficError, type TrafficFailure, type TrafficProvider } from '../traffic/types';

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

export type Stage = 'download' | 'traffic' | 'graph' | 'search';

/** Whether live traffic shaped the routes, and if not, why not. */
export type TrafficOutcome =
  | { status: 'off' }
  | ({
      status: 'live';
      provider: TrafficProvider;
      fetchedAt: number;
      /** Tiles that never arrived; their roads kept their usual speeds. */
      missingTiles: number;
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
}

/** One algorithm's search, ready to play back. */
export interface AlgorithmRun {
  algorithm: AlgorithmId;
  /** The weight on the estimate: A*'s setting, 1 for everything else. */
  weight: number;
  timeline: Timeline;
  stats: SearchStats;
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
    options: { signal?: AbortSignal },
  ): Promise<TimedTraffic>;
  onProgress(stage: Stage, server?: ServerAttempt): void;
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
      ? deps.fetchTraffic(source, area, { signal }).then(
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
  if (source && traffic) {
    deps.onProgress('traffic');
    const answer = await traffic;
    signal?.throwIfAborted();
    if ('fetched' in answer) {
      const { readings, missingTiles, fetchedAt } = answer.fetched;
      segmentTraffic = matchTraffic(network, readings);
      const coverage = trafficCoverage(network, segmentTraffic);
      outcome = { status: 'live', provider: source.provider, fetchedAt, missingTiles, ...coverage };
    } else {
      if (isAbort(answer.error)) throw answer.error;
      const reason = answer.error instanceof TrafficError ? answer.error.reason : 'unavailable';
      outcome = { status: 'failed', provider: source.provider, reason };
    }
  }

  deps.onProgress('graph');
  const prepared = prepareSearch(network, request, segmentTraffic);
  signal?.throwIfAborted();

  deps.onProgress('search');
  const { graph, snapped } = prepared;
  const runs = request.algorithms.map((algorithm): AlgorithmRun => {
    signal?.throwIfAborted();
    const weight = algorithm === 'astar' ? (request.astarWeight ?? 1) : 1;
    const { heuristic, backwardHeuristic } = prepared;
    const search = {
      ...prepared,
      heuristic: weight === 1 ? heuristic : (n: number) => weight * heuristic(n),
    };
    const trace = runSearch(algorithms[algorithm].search, search);
    return {
      algorithm,
      weight,
      // The timeline keeps the plain estimate, which is what the inspector explains.
      timeline: buildTimeline(
        graph,
        trace,
        heuristic,
        algorithms[algorithm].frontier,
        backwardHeuristic,
      ),
      stats: summarize(trace.events),
    };
  });
  const at = ({ node, meters }: { node: number; meters: number }) => ({
    lat: graph.lat[node]!,
    lon: graph.lon[node]!,
    meters,
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
  };
}

/** The buffers behind every timeline, so posting the result moves rather than copies them. */
export function transferablesOf(result: JobResult): ArrayBuffer[] {
  const views: ArrayBufferView[] = result.runs.flatMap(({ timeline }) => {
    const own: ArrayBufferView[] = Object.values(timeline).filter(ArrayBuffer.isView);
    return timeline.route ? [...own, timeline.route.positions] : own;
  });
  views.push(result.places.nodeLabel);
  return views.map((view) => view.buffer as ArrayBuffer);
}
