# Pathfinder

Learn graph search by watching algorithms route across real streets. Pick a start and a
destination anywhere on Earth, up to 15 km apart. Choose one or more algorithms and watch each one
explore the road network: play it, slow it down, step through it one expansion at a time, or
compare up to six side by side.

- **Explore:** BFS, DFS, greedy best-first, Dijkstra and A* (with a weight on its estimate).
  Bidirectional BFS, Dijkstra and A*. Bellman-Ford, ALT (landmarks) and contraction hierarchies,
  with their preparation shown as a step of its own. By car, bike or on foot, for the fastest or
  the shortest route. An inspector shows the frontier, the current pseudocode line and the costs
  behind each step.
- **Learn:** an article for every algorithm and for the foundations (graphs, roads as graphs,
  frontiers, estimates), with diagrams you can step through. The diagrams are driven by the same
  code that runs on the map.

Pathfinder works on a phone as well as on a desktop.

## Privacy and keys

Pathfinder has no server of its own and no analytics. Your browser talks directly to:

- **OpenStreetMap services**: Overpass for the streets around A and B, Nominatim for address
  search, and OpenFreeMap for the map's tiles. These see the area you search and your IP address,
  as with any website.
- **TomTom or HERE**, only if you add your own key for live traffic. The key is kept in this
  browser's local storage and sent only to the provider it belongs to. Requests count against
  your own quota. Without a key, cars use speed limits, and bikes and walking use average speeds.

## Offline

Pathfinder can be installed as an app, and once visited it opens without a connection: Learn in
full, and Explore for routes you have run before. The streets for each route you run are kept on
the device for a week after its last run, along with the map tiles you have seen. Offline, the
plan lists these saved routes with their size, and you can remove any of them. A and B can move
anywhere inside a saved route's area. Address search, live traffic and new areas need a
connection.

## Development

Requires Node 24.

```sh
npm install
npx playwright install chromium   # once, for e2e tests
npm run dev                        # dev server
npm test                           # unit tests (Vitest)
npm run test:e2e                   # e2e tests on desktop and phone, then Lighthouse (Playwright)
npm run lint && npm run typecheck && npm run format:check
```

Read [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) before changing anything: the project is
test-first, and every interface change starts as an approved design.
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains how a run gets from "Run" to the map, and
[docs/PLAN.md](docs/PLAN.md) holds the scope, the phases and what was measured along the way.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), under the Open
Database License.
