# Pathfinder

Learn graph traversal algorithms by watching them route across real maps. Pick a start point, a
destination and one or more algorithms, then watch them explore the road network side by side.

See [docs/PLAN.md](docs/PLAN.md) for the scope, architecture and roadmap.

## Development

Requires Node 24.

```sh
npm install
npx playwright install chromium   # once, for e2e tests
npm run dev                        # dev server
npm test                           # unit tests (Vitest)
npm run test:e2e                   # e2e tests, desktop + mobile (Playwright)
npm run lint && npm run typecheck && npm run format:check
```

This project uses TDD: write a failing test first, then make it pass.
