# Pathfinder — Project Plan

A web platform for learning graphs and graph-traversal algorithms on real maps. The user chooses a
start point, a destination and one or more algorithms. They then watch each algorithm explore the
road network in real time, or slowed down or sped up, and compare the results.

## Scope

| Area       | Decision                                                                                                                                                                                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Purpose    | A learning tool. Step-by-step mode, internal stats (nodes expanded, frontier size, path cost) and an explanation for each algorithm.                                                                                                                       |
| Range      | City scale (about 20–50 km), anywhere on Earth. The OSM road network is fetched for the area when needed.                                                                                                                                                  |
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
- [ ] Phase 4 — Single-algorithm visualization
