import { algorithms, type AlgorithmId } from '../algorithms';
import { runSearch, summarize, type SearchStats } from '../algorithms/trace';
import { searchArea, type BBox, type LatLon } from '../osm/area';
import type { Objective, RoadNetwork } from '../osm/network';
import { prepareSearch } from '../osm/prepare';
import type { TravelMode } from '../osm/roads';
import { buildTimeline, type Timeline } from '../playback/timeline';

export interface JobRequest {
  start: LatLon;
  target: LatLon;
  mode: TravelMode;
  objective: Objective;
  /** Run in this order, all on the same roads between the same snapped points. */
  algorithms: AlgorithmId[];
  /** Multiplies A*'s estimate (weighted A*): above 1 it expands less but may miss the best route. */
  astarWeight?: number;
}

export type Stage = 'download' | 'graph' | 'search';

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
}

export interface JobDeps {
  loadRoadNetwork(
    area: BBox,
    options: { signal?: AbortSignal; onAttempt?: (endpoint: string, index: number) => void },
  ): Promise<{ network: RoadNetwork; fromCache: boolean }>;
  onProgress(stage: Stage, server?: ServerAttempt): void;
  signal?: AbortSignal;
}

/** Everything between "Run" and playable timelines: area, roads, graph, then each search. */
export async function runJob(request: JobRequest, deps: JobDeps): Promise<JobResult> {
  const { signal } = deps;
  if (request.algorithms.length === 0) throw new Error('Choose at least one algorithm.');
  const area = searchArea(request.start, request.target);
  deps.onProgress('download');
  const { network, fromCache } = await deps.loadRoadNetwork(area, {
    signal,
    onAttempt: (endpoint, index) => {
      if (index > 0)
        deps.onProgress('download', { host: new URL(endpoint).host, attempt: index + 1 });
    },
  });
  signal?.throwIfAborted();

  deps.onProgress('graph');
  const prepared = prepareSearch(network, request);
  signal?.throwIfAborted();

  deps.onProgress('search');
  const { graph, snapped } = prepared;
  const runs = request.algorithms.map((algorithm): AlgorithmRun => {
    signal?.throwIfAborted();
    const weight = algorithm === 'astar' ? (request.astarWeight ?? 1) : 1;
    const { heuristic } = prepared;
    const search = {
      ...prepared,
      heuristic: weight === 1 ? heuristic : (n: number) => weight * heuristic(n),
    };
    const trace = runSearch(algorithms[algorithm].search, search);
    return {
      algorithm,
      weight,
      // The timeline keeps the plain estimate, which is what the inspector explains.
      timeline: buildTimeline(graph, trace, heuristic),
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
  };
}

/** The buffers behind every timeline, so posting the result moves rather than copies them. */
export function transferablesOf(result: JobResult): ArrayBuffer[] {
  return result.runs.flatMap(({ timeline }) => {
    const views: ArrayBufferView[] = Object.values(timeline).filter(ArrayBuffer.isView);
    if (timeline.route) views.push(timeline.route.positions);
    return views.map((view) => view.buffer as ArrayBuffer);
  });
}
