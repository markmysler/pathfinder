# Architecture

Pathfinder is a static site: React for the page, MapLibre GL for the map and deck.gl for what is
drawn on it. Everything heavy runs in a Web Worker. No backend is involved: the browser downloads
streets from Overpass, addresses from Nominatim, tiles from OpenFreeMap and, with the user's key,
traffic from TomTom or HERE.

```
 Page (React)                                     Worker (src/worker/search.worker.ts)
 ─────────────                                    ────────────────────────────────────
 PlanPanel ── Run ──► SearchClient ─ postMessage ─► runJob
                       (worker/client.ts)            1. searchArea(A, B)       osm/area.ts
                                                     2. loadRoadNetwork        osm/load.ts
                                                        IndexedDB cache → Overpass → saved area
                                                     3. traffic (optional)     traffic/*
                                                     4. prepareSearch: graph, snapping, weights
                                                     5. prepareGraph: landmarks / shortcuts
                                                     6. runSearch → events → buildTimeline
 exploreState ◄── done (timelines, transferred) ──┘
   │
   ├─ playback clock (playback/playback.ts) ──► step number
   └─ MapCanvas: deck.gl layers filtered to that step; Inspector, PlaybackBar, CompareView
```

## Algorithms emit events

Every search in `src/algorithms` is a generator over the same graph and yields the same four
events (`src/algorithms/types.ts`):

- `push`: a node enters the frontier, through an edge, at a cost.
- `pop`: a node is expanded. Each pop is one step of playback.
- `skip`: an outdated frontier entry is thrown away.
- `meet`: in a bidirectional search, both sides have reached a node.

Algorithms never touch the map or the page. This keeps them deterministic, lets property tests
compare every one of them against a brute-force reference (`src/test/reference.ts`), and lets
Learn's diagrams (`src/learn/diagram.ts`) run the real code on small hand-made graphs.

Bidirectional searches tag events with a `side`. Contraction hierarchies' events name shortcut
edges, described by `SearchEdges`. ALT and contraction hierarchies take their preparation
(`landmarks`, `hierarchy`) ready-made from the worker, which keeps it for the next run on the same
roads (`src/worker/preparations.ts`).

## Graphs are flat arrays

`src/graph/graph.ts` stores a graph in CSR form: per node `lat`, `lon` and `firstEdge`; per edge
`edgeSource`, `edgeTarget` and `edgeWeight`. The OSM pipeline (`src/osm`) builds it as follows:

1. `overpassQuery` asks for every road in the search area. The client tries three public servers
   in turn, with a 70 s limit each.
2. `buildRoadNetwork` turns the response into one network for all travel modes, with each way's
   tags.
3. `prepareSearch` picks the roads open to the travel mode, weighs them by length or travel time
   (with traffic, for cars), keeps the largest strongly connected part, and snaps A and B to it.

## Cache and saved areas

Downloaded networks are stored in IndexedDB (`src/osm/cache.ts`), keyed by their Overpass query.
The search area is snapped to a coarse grid, so nearby routes share a download.

`src/osm/saved.ts` keeps an index of these areas, each with the route that downloaded it, its
size and when it was last used. An area is forgotten, and its streets deleted, a week after its
last run.

When streets can't be downloaded, `loadRoadNetwork` lets any saved area that holds A and B stand
in. That happens when the browser is offline or Overpass fails. With no saved area to stand in, an
offline run fails with `NotSavedError`, which the page shows as "These streets aren't on this
device". The page lists saved areas through `SearchClient.savedAreas`.

## Traces become timelines

A raw trace is a long list of events. `buildTimeline` (`src/playback/timeline.ts`) turns it once
into typed arrays indexed by step, so that drawing any step is cheap:

- what was expanded at each step, and its cost and estimate;
- each explored road, with the step it appeared;
- each frontier entry, with the steps it entered and left;
- frontier sizes over time;
- the route, and for bidirectional searches where the sides met.

`src/playback/frontier.ts`, `sides.ts` and `rounds.ts` answer questions about one step for the
inspector, such as what is in the frontier now, whether a bidirectional search could stop yet, and
which Bellman-Ford round is running.

Timelines are made of typed arrays, so the worker transfers them to the page instead of copying
them (`transferablesOf`).

## Playback

`src/playback/playback.ts` is a plain clock. A position in steps, which may be fractional, advances
with each animation frame at `speed × 200` steps per second, from 0.1× to 100×. Stepping,
scrubbing and jumping to the end only set that position.

Comparisons share one clock. Each map shows `min(position, its own steps)`, so a fast algorithm
finishes and waits while the others carry on. `src/map/cameraSync.ts` keeps comparison maps
looking at the same place.

## Map layers

`src/map/explorationLayers.ts` builds deck.gl layers from a timeline once, as binary attributes.
For each step it only changes a `DataFilterExtension` range: roads with `roadStep ≤ step`, and
frontier dots between their enter and leave steps. The GPU applies the filter, so scrubbing
through a search of hundreds of thousands of steps doesn't rebuild anything.

`advancedLayers.ts` adds landmarks, Bellman-Ford's rounds and contraction's shortcuts.
`trafficLayers.ts` adds slow, jammed and closed roads.

The map is the heaviest part of the app:

- `LazyMapCanvas` loads MapLibre after the page.
- `overlay.ts` loads deck.gl with the first run.
- `removeOverlay` releases deck.gl's WebGL context when a map goes. Browsers allow only about 16
  contexts, which is why a run is capped at six algorithms.
- `graphics.ts` detects WebGL drawn in software, where big searches stall, and the page says so.

## Page state

`src/explore/exploreState.ts` is one reducer for Explore: places, mode, objective, algorithms,
traffic settings and the run (idle, loading with its stage, failed with a `JobError`, or ready
with its result and playback). Components get it through props. Anything that talks to the
outside world comes from `useServices()` (`src/app/services.ts`), so tests swap in fakes.

## Offline and updates

`vite-plugin-pwa` generates a service worker (`vite.config.ts`). It caches the built app, the
latin font files and the map style, and caches tiles of places already seen up to 3,000. A new
deployment downloads in the background. `UpdatePrompt` then offers to reload, but waits while a run
is open. `useOnline` follows the browser's connection: offline, Explore shows the saved routes and
drops live traffic.

## Learn

Articles live in `src/learn/articles`, one per topic in `src/learn/topics.ts`. Diagrams use small
graphs from `networks.ts`, run through the real algorithms. `streets.ts` and `measured.ts` hold
results recorded on real Buenos Aires streets, so the articles can quote real numbers without
downloading anything.
