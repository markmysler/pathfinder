# Changelog

## Unreleased

- **Link previews:** a shared link to Pathfinder now shows a title, a description and a picture of
  three algorithms racing, on LinkedIn, Slack, X and other sites that read Open Graph tags.

## 1.0.0

The first release: watch graph search algorithms route across real streets, anywhere on Earth.

- **Algorithms:** BFS, DFS, greedy best-first, Dijkstra, A\* (with a weight on its estimate),
  bidirectional BFS, Dijkstra and A\*, Bellman-Ford (with negative costs and negative loops in
  Learn), ALT (landmarks) and contraction hierarchies. ALT's landmarks and the hierarchy's
  shortcuts are prepared as a step of their own, timed, and reused for the next run on the same
  roads.
- **Explore:** pick A and B by address or on the map, up to 15 km apart; travel by car, bike or on
  foot; optimise for the fastest or the shortest route. Play, pause, step, scrub, and change speed
  from 0.1× to 100×. Compare up to six algorithms side by side on synced maps with one clock and a
  results table. An inspector shows the frontier, the current pseudocode line and the costs
  behind each step.
- **Try a sample route:** Cabildo to Casa Rosada in Buenos Aires runs at once on streets bundled
  with the app, online or offline.
- **Live traffic:** with your own TomTom or HERE key, kept in your browser; car routes slow down on
  jammed roads and avoid closed ones.
- **Learn:** an article for every algorithm and for the foundations, with diagrams you can step
  through, driven by the same code as the map.
- **Offline and installable:** Learn in full, and Explore for routes you have run before.
- **Quality:** property tests against a brute-force reference, end-to-end tests on desktop and
  phone, axe with no violations, Lighthouse budgets in CI, and a Content Security Policy.
