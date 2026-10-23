import type { Geocoder, Place } from '../geo/nominatim';
import { algorithms, type AlgorithmId } from '../algorithms';
import { straightLineHeuristic } from '../algorithms/heuristics';
import { runSearch, summarize } from '../algorithms/trace';
import { buildTimeline } from '../playback/timeline';
import type { JobResult } from '../worker/job';
import { grid } from './fixtures';

export const casaRosada: Place = {
  name: 'Casa Rosada',
  detail: 'Balcarce 50, Buenos Aires',
  lat: -34.608,
  lon: -58.3703,
};
export const cabildo: Place = {
  name: 'Cabildo de Buenos Aires',
  detail: 'Bolívar 65, Buenos Aires',
  lat: -34.6087,
  lon: -58.3738,
};

export function fakeGeocoder(places: Place[] = [casaRosada, cabildo]) {
  return {
    search: vi.fn<Geocoder['search']>(async (query) =>
      places.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())),
    ),
    reverse: vi.fn<Geocoder['reverse']>(async () => null),
  } satisfies Geocoder;
}

/** A real search result on a small grid, shaped like the worker's. */
export function fakeJobResult(algorithm: AlgorithmId = 'astar'): JobResult {
  const graph = grid(5);
  const heuristic = straightLineHeuristic(graph, 24);
  const trace = runSearch(algorithms[algorithm].search, {
    graph,
    source: 0,
    target: 24,
    heuristic,
  });
  return {
    algorithm,
    mode: 'car',
    objective: 'shortest',
    area: { south: -0.005, west: -0.005, north: 0.009, east: 0.009 },
    fromCache: false,
    snapped: {
      start: { lat: 0, lon: 0, meters: 3 },
      target: { lat: 0.004, lon: 0.004, meters: 4 },
    },
    timeline: buildTimeline(graph, trace, heuristic),
    stats: summarize(trace.events),
  };
}
