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

The whole app is precached, map code included: about 3.5 MB on disk, about 1.1 MB over the
network, since everything but the fonts is served compressed. Explore is the landing page and
already loads most of that (MapLibre, deck.gl and their workers), and the precache reuses the
browser's copies of those hashed files instead of fetching them twice. The real extra cost of
precaching on a first visit is Learn's code and the fonts, about 300 KB, fetched after the page
has loaded. Caching the map code only at runtime instead was considered and rejected: the first
visit isn't controlled by the service worker yet, so the map code it loads wouldn't be kept, and
after an update the new map code would only be cached once Explore ran again online. Either way,
"routes you have run open offline" would silently break.

## Learn

Articles live in `src/learn/articles`, one per topic in `src/learn/topics.ts`. Diagrams use small
graphs from `networks.ts`, run through the real algorithms. `streets.ts` and `measured.ts` hold
results recorded on real Buenos Aires streets, so the articles can quote real numbers without
downloading anything.

## Limits and measurements

What was measured while building Pathfinder, and the limits that came out of it.

- **Six algorithms per run.** Each comparison map uses two WebGL contexts (MapLibre and deck.gl's
  overlay) and browsers allow about 16. deck.gl's interleaved mode, which would share one, fails
  on MapLibre 6 (`_nearZ` errors), so `MAX_ALGORITHMS` is 6.
- **Overpass is slow.** Public Overpass servers often take 30–60 s or are down. The client tries
  three servers, with a 70 s limit each, and caches every area it downloads in IndexedDB.
- **Drawing needs a GPU.** On a 9 km route with a real GPU, playback holds 60 fps, with one 0.8 s
  hitch when six maps start. When WebGL is drawn in software the page freezes for 10–20 s whenever
  a big search is drawn, which is why `graphics.ts` warns about it. Headless Chromium and CI draw
  in software, so judge drawing speed headed, on a real GPU.
- **First load.** The map code loads after the page, so the start shared by Explore and Learn is
  76 KB gzipped (it was one 629 KB bundle). Lighthouse, phone profile: Explore 69–72 (budget 65,
  nearly all of its blocking time is MapLibre starting and drawing in software), Learn 93–94;
  accessibility, best practices and SEO 100; no layout shift.
- **Bidirectional search.** On the recorded streets, bidirectional Dijkstra expands 57% fewer nodes
  than Dijkstra, but bidirectional A\* only 6% fewer than A\*. Better estimates (ALT) are where A\*
  gains. Bidirectional A\* uses the averaged estimate, which needs consistent estimates; straight-line
  distance is one. The A\* weight applies to one-way A\* only.
- **Bellman-Ford** stops recording at 400,000 steps and says how many the whole search needs. At
  the top speed of 100×, 400,000 steps take about 20 s.
- **Live traffic.** Checked with a real TomTom key around Plaza de Mayo: zoom-14 flow tiles cover
  96% of residential street directions, 93% of living streets, every main road and 15% of service
  roads, and a line's point order is its direction of travel. Matching ignores road type, so a
  service road within 15 m of a jammed avenue, running the same way, takes the avenue's speed.
  HERE sends its 401s without CORS headers, so a wrong HERE key reads as "HERE didn't answer"; the
  messages say so. HERE hasn't been checked with a real key. Contraction hierarchies leave out
  road-by-road traffic notes, because their events name shortcuts, which have no single road.
- **Not covered end to end:** a real new deployment reaching the update prompt. Playwright can't
  intercept the service worker's own script, so `UpdatePrompt` is unit-tested only.
