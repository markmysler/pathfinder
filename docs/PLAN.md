# Pathfinder — Project Plan

A web platform for learning graphs and graph-traversal algorithms on real maps. The user chooses a
start point, a destination and one or more algorithms. They then watch each algorithm explore the
road network in real time, or slowed down or sped up, and compare the results.

## Scope

| Area       | Decision                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose    | A learning tool. Step-by-step mode, internal stats (nodes expanded, frontier size, path cost) and an explanation for each algorithm.                                                                                                                       |
| Range      | City scale (A and B at most 15 km apart), anywhere on Earth. The OSM road network is fetched for the area when needed.                                                                                                                                     |
| Stack      | TypeScript, entirely in the browser. Algorithms run in a Web Worker. No backend.                                                                                                                                                                           |
| Hosting    | Public static site (GitHub Pages).                                                                                                                                                                                                                         |
| Devices    | Mobile and desktop are both first-class targets.                                                                                                                                                                                                           |
| Traffic    | Users may enter their own TomTom/HERE key, which is stored only in their browser, so quota is per user. Otherwise the app uses OSM speed limits and road-type defaults. Walking and cycling use average speeds.                                            |
| Algorithms | BFS, DFS, Greedy, Dijkstra and A*, then the bidirectional variants, then Bellman-Ford, ALT and Contraction Hierarchies.                                                                                                                                    |
| Comparison | Desktop: maps side by side with synced pan and zoom, a shared playback clock, and a stats table. Phone: up to 3 maps stacked, with chips to choose which to show (picking a 4th replaces the one picked longest ago); results always list every algorithm. |
| Input      | Click on the map, or search for an address (Nominatim).                                                                                                                                                                                                    |
| Objective  | A toggle between the fastest and the shortest route.                                                                                                                                                                                                       |
| Playback   | Play, pause, step, a speed slider from 0.1× to 100×, and a jump to the end.                                                                                                                                                                                |
| Learn      | A Learn tab, alongside Explore: in-depth articles on every algorithm and on the foundations, with diagrams you can step through, pseudocode, complexity and links back to the map.                                                                         |
| Look       | "Night Chart": dark theme only, with IBM Plex Sans and Mono. Each algorithm has a fixed color (BFS blue, DFS pink, Greedy amber, Dijkstra teal, A* lavender) plus a text badge.                                                                            |

## Working rules

- **TDD.** Write a failing test first, then the implementation, then refactor. Unit tests never touch the network; they use recorded fixtures.
- **Design first.** Every UI phase begins with design artifacts for phone and desktop. HTML/CSS is written only after those designs are approved.
- Every phase ends with something that works, is deployed and is tested.

## Architecture

```
┌──────────────────────── Browser (static site) ─────────────────────────┐
│  UI (React + MapLibre GL + deck.gl overlay)                            │
│   ├─ search / map-click → Nominatim                                    │
│   ├─ playback controller (clock, speed, step, scrub) ◄── event traces  │
│   └─ N synced map views + stats table                                  │
│                         ▲ postMessage                                  │
│  Web Worker                                                            │
│   ├─ OSM loader (Overpass → graph builder → IndexedDB cache)           │
│   ├─ weights (mode × fastest/shortest × traffic provider)              │
│   └─ algorithms → emit event traces                                    │
│  Traffic providers: OSM speeds (default) | TomTom | HERE (user's key)  │
└────────────────────────────────────────────────────────────────────────┘
```

Key decisions:

- **Algorithms are generators that emit events** (`push`, `pop`, `relax`, `found`, …). They never touch the map, which keeps them pure, deterministic and easy to test.
- **Computing and playback are separate.** The worker computes a full trace of events, and the UI replays it at any speed. This gives stepping backward, scrubbing and a shared clock across algorithms with little extra work.
- **The graph is stored in flat typed arrays (CSR format).** This is fast, transfers to the worker without copying, and handles hundreds of thousands of nodes.

Tooling:

- Vite and TypeScript in strict mode.
- Vitest with fast-check for property-based tests, plus Testing Library for components.
- Playwright at phone and desktop viewport sizes.
- ESLint and Prettier.
- Map tiles from OpenFreeMap (no key needed).
- GitHub Actions for CI and for deploying to GitHub Pages.

## Phases

| #   | Phase                                                           | Delivers                                                                                                                                                                                                                                                                                       | Tests first                                                                                           |
| --- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 0   | **Setup**                                                       | git, Vite, lint, Vitest, Playwright, CI, empty deploy                                                                                                                                                                                                                                          | A smoke test that fails, then passes                                                                  |
| 1   | **Graph core + base algorithms**                                | CSR graph, event protocol, BFS, DFS, Greedy, Dijkstra, A*. No UI.                                                                                                                                                                                                                              | Small hand-built graphs with known answers, plus property-based tests                                 |
| 2   | **Design: overall UI**                                          | Artifacts for the main screen, picker, playback controls, stats, and the comparison view, each on phone and desktop                                                                                                                                                                            | Waits for approval                                                                                    |
| 3   | **OSM pipeline**                                                | Overpass query, graph builder (one-way streets, access per mode, speed defaults), snapping a point to the nearest road, size cap, IndexedDB cache                                                                                                                                              | Saved Overpass responses as fixtures                                                                  |
| 4   | **Single-algorithm visualization**                              | Map, point selection, address search, worker, playback, rendering, mode and fastest/shortest toggles                                                                                                                                                                                           | Component tests and end-to-end tests on phone and desktop                                             |
| 5   | **Multi-algorithm comparison**                                  | Synced maps, shared clock, stats table, phone layout                                                                                                                                                                                                                                           | Tests for clock sync and layout at each breakpoint                                                    |
| 6   | **Learning features + Learn section** (design checkpoint first) | Frontier and priority-queue inspector, pseudocode that highlights the current line, an estimate-weight setting for A* (weighted A*), and a Learn tab with an article per algorithm and per foundation topic. Articles include diagrams you can step through, with a "Show as Dijkstra" replay. | Tests that each trace event maps to the right pseudocode line; the diagrams are driven by real traces |
| 7   | **Bidirectional variants**                                      | Bidirectional BFS, Dijkstra and A*, with the meeting point shown                                                                                                                                                                                                                               | Property test: same cost as the one-way version                                                       |
| 8   | **Traffic** (design checkpoint first)                           | API-key settings, provider interface, TomTom adapter, matching traffic segments to OSM roads, HERE adapter                                                                                                                                                                                     | Matching tested on fixtures, and the fallback path tested                                             |
| 9   | **Advanced algorithms**                                         | Bellman-Ford, ALT (landmarks), Contraction Hierarchies, each with visuals for preprocessing                                                                                                                                                                                                    | Property tests against Dijkstra                                                                       |
| 10  | **Polish**                                                      | Performance profiling, accessibility, offline use (PWA), docs                                                                                                                                                                                                                                  | Lighthouse and axe checks in CI                                                                       |

Phase 1 can run in parallel with the design review in phase 2.

## Known risks

1. **Fair-use limits on public Overpass.** Mitigated by caching areas in IndexedDB and capping the area size.
2. **Matching traffic data to OSM roads.** TomTom and HERE describe traffic on their own road segments, so the two must be linked by geometric matching. This is deferred to phase 8.
3. **ALT and CH need preprocessing.** It takes a few seconds on a city-sized graph. CH needs its own way of showing the shortcut edges it adds.

## Progress

- [x] Phase 0 — Setup (repo, Vite + React + TS, Vitest, Playwright desktop+mobile, ESLint, Prettier, CI + Pages deploy)
- [x] Phase 1 — Graph core + base algorithms (CSR graph, event protocol, BFS, DFS, Greedy, Dijkstra, A*; property-tested against a brute-force reference)
- [x] Phase 2 — Design: overall UI (approved; canvas: https://claude.ai/artifact/1yywQJ9p4xK44XNhqaNgRG)
- [x] Phase 3 — OSM pipeline (search area + size cap, OSM tag rules per mode, road network, routing graphs, largest SCC + snapping, Overpass client with fallback, IndexedDB cache; tested on recorded Plaza de Mayo data)
- [x] Phase 4 — Single-algorithm visualization (MapLibre + deck.gl map, address search, worker, playback, inspector, desktop and phone layouts per the approved designs)
- [x] Phase 5 — Multi-algorithm comparison
- [x] Phase 6 — Learning features + Learn section (frontier and line-by-line pseudocode in the inspector, weighted A*, Learn home and 11 articles with trace-driven diagrams; design boards on the canvas under "Phase 6")
- [x] Phase 7 — Bidirectional variants (BFS, Dijkstra and A* from both ends, one engine with the stop rule "next from A + next from B ≥ best"; A* shares one estimate, half the difference of the two, so the same rule holds; each side in its own colour, the best meeting point on the map, a "can it stop yet?" meter, both frontiers in the inspector, and a Learn article; design boards on the canvas under "Phase 7")

- [x] Phase 8 — Traffic (the user's own TomTom or HERE key, kept in their browser and sent only to that provider, straight from the browser; TomTom flow tiles and HERE flow read into one model, the current speed as a share of free flow; matched to OSM edges by distance and direction; car edges scaled by that share and closed roads dropped, so A* stays exact; any failure falls back to speed limits and says why; slow, jammed and closed roads and the route without traffic on the map; the traffic story in the inspector; a Live traffic section with a rush hour in Learn; design boards on the canvas under "Phase 8")

- [x] Phase 9 — Advanced algorithms (design approved 2026-10-24; boards on the canvas under "Phase 9"). Bellman-Ford, ALT and contraction hierarchies in Explore and Learn. ALT's landmarks and CH's shortcuts are prepared in the worker as a step of their own, timed, and kept in memory for the next run on the same roads (area, mode, objective and traffic snapshot). CH on its own plays its contraction first, node by node with the shortcuts each one leaves, then climbs from both ends with its own stop rule. Bellman-Ford plays round by round, rings its corrections, and stops recording at 400,000 steps, saying how many the whole search needs. ALT shows the landmark behind each estimate and the arithmetic. Comparisons add search and preparing times and when preparing pays. Learn has an Advanced group: Bellman-Ford with negative costs and a negative loop (the core now detects them), ALT's triangle trick, and contraction step by step, all driven by the real code.

Follow-ups noted during phase 4:

- The JS bundle is about 560 KB gzipped (mostly deck.gl and MapLibre); split it in phase 10.
- Public Overpass servers are often slow (30–60 s) or down; the client tries three servers with a 70 s limit each.

Follow-ups noted during phase 5:

- Each comparison map uses two WebGL contexts (MapLibre plus deck.gl's overlay canvas), and browsers allow about 16. deck.gl's interleaved mode, which would share one, fails on MapLibre 6 (`_nearZ` errors). A run is therefore capped at 6 algorithms (`MAX_ALGORITHMS`).

Follow-ups noted during phase 7:

- Bidirectional A* uses the shared ("average") estimate, which needs consistent estimates; straight-line distance is. The A* weight applies to one-way A* only.
- On the recorded streets bidirectional Dijkstra expands 57% fewer nodes than Dijkstra, but bidirectional A* only 6% fewer than A*. Better estimates (ALT, phase 9) are where A* gains.

Follow-ups noted during phase 8:

- Checked with a real TomTom key on 2026-10-23, around Plaza de Mayo: zoom-14 tiles carry local streets (96% of residential and 93% of living-street directions got a reading, every main road did, service roads 15%), and a line's point order is its direction of travel (on one-way streets 1,973 of 2,119 directions matched as drawn, 110 when reversed). Responses carry CORS for the site. HERE is still unchecked with a real key.
- HERE sends its 401s without CORS headers, so a wrong HERE key reads as "HERE didn't answer"; the messages say so.
- Matching ignores road type: a service road within 15 m of a jammed avenue, and running the same way, would take the avenue's speed.

Follow-ups noted during phase 9:

- The playback speed tops out at 100×; Bellman-Ford's 400,000 steps then take about 20 s. The boards showed 300×.
- CH's road-by-road traffic notes are left out: its events name shortcuts, which have no single road's traffic.
- Fixed: the property test "stopCheck is only sure of the route at the last step" failed about one run in seventeen (seed -1531813667). The tiny weights were only fast-check shrinking; the cause was outdated entries a search throws away after its last expansion. They had no step to belong to, so the last step still counted them as waiting: the stop line could show a sum below the best route, and the final frontier listed entries already gone. They now leave at the last step, after its roads.
