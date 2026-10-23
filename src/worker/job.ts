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
  algorithm: AlgorithmId;
}

export type Stage = 'download' | 'graph' | 'search';

export interface SnappedPoint extends LatLon {
  /** Distance from the requested point to the road it snapped to. */
  meters: number;
}

export interface JobResult {
  algorithm: AlgorithmId;
  mode: TravelMode;
  objective: Objective;
  area: BBox;
  fromCache: boolean;
  snapped: { start: SnappedPoint; target: SnappedPoint };
  timeline: Timeline;
  stats: SearchStats;
}

export interface JobDeps {
  loadRoadNetwork(
    area: BBox,
    options: { signal?: AbortSignal },
  ): Promise<{ network: RoadNetwork; fromCache: boolean }>;
  onProgress(stage: Stage): void;
  signal?: AbortSignal;
}

/** Everything between "Run" and a playable timeline: area, roads, graph, search. */
export async function runJob(request: JobRequest, deps: JobDeps): Promise<JobResult> {
  const { signal } = deps;
  const area = searchArea(request.start, request.target);
  deps.onProgress('download');
  const { network, fromCache } = await deps.loadRoadNetwork(area, { signal });
  signal?.throwIfAborted();

  deps.onProgress('graph');
  const prepared = prepareSearch(network, request);
  signal?.throwIfAborted();

  deps.onProgress('search');
  const trace = runSearch(algorithms[request.algorithm].search, prepared);
  const { graph, snapped } = prepared;
  const at = ({ node, meters }: { node: number; meters: number }) => ({
    lat: graph.lat[node]!,
    lon: graph.lon[node]!,
    meters,
  });
  return {
    algorithm: request.algorithm,
    mode: request.mode,
    objective: request.objective,
    area,
    fromCache,
    snapped: { start: at(snapped.start), target: at(snapped.target) },
    timeline: buildTimeline(graph, trace, prepared.heuristic),
    stats: summarize(trace.events),
  };
}

/** The buffers behind a timeline, so posting it from the worker moves rather than copies them. */
export function transferablesOf(timeline: Timeline): ArrayBuffer[] {
  const views: ArrayBufferView[] = Object.values(timeline).filter(ArrayBuffer.isView);
  if (timeline.route) views.push(timeline.route.positions);
  return views.map((view) => view.buffer as ArrayBuffer);
}
