# Contributing

## Test first

Every change starts with a test that fails for the right reason. Then write the least code that
makes it pass, and tidy up with the tests green.

- **Unit and component tests** (Vitest, Testing Library) sit beside the code as `*.test.ts(x)`.
  Algorithms also get property tests (fast-check) against the brute-force reference in
  `src/test/reference.ts`: any new search must agree with it on random graphs.
- **End-to-end tests** (Playwright, `e2e/`) run every journey twice, at a desktop size and on a
  Pixel 7.
  - `accessibility.spec.ts` runs axe over every page and state and expects nothing.
  - `lighthouse.spec.ts` runs last, in its own project, and holds the performance budgets: phone
    profile, Explore at least 65, Learn at least 90. Accessibility, best practices and SEO must
    score 100.
- **No network in tests.** Unit tests use recorded fixtures. End-to-end tests answer every outside
  request from `e2e/network.ts`: Overpass, Nominatim, the map style and tiles, and TomTom.

Before pushing:

```sh
npm run lint && npm run format:check && npm run typecheck && npm test && npm run test:e2e
```

CI runs the same checks and deploys `main` to GitHub Pages when they pass.

## Design for both sizes

Phones and desktops are both first-class. Design any interface change for both before writing it,
and show both sizes in the pull request (screenshots or a short recording). The look is
"Night Chart":

- Dark only, with the tokens in `src/styles/tokens.css`.
- IBM Plex Sans and Mono.
- Each algorithm keeps its own colour and text badge (`src/ui/algorithmStyle.ts`).
- Touch targets are at least 44 px.

## Recording fixtures

Recorded responses live in `src/osm/fixtures`, listed in its `README.md` with their area, server
and date. To add one:

1. Build the query with `overpassQuery(box)` from `src/osm/overpass.ts`, so the fixture matches
   what the app really asks for.
2. Download it with `curl`. In some environments Node can't reach the Overpass servers, but `curl`
   can. For example:

   ```sh
   curl -s --data-urlencode "data=<query>" https://overpass.private.coffee/api/interpreter \
     > src/osm/fixtures/<name>.overpass.json
   ```

3. Keep the area small: a few hundred metres is enough for most tests, and the file is committed.
4. Add a row to the fixtures README: the file, the box, the server and the date. Keep the
   OpenStreetMap attribution.

Numbers that Learn quotes from real streets are recorded the same way, into `src/learn/measured.ts`
and `streets.ts`. Note how they were measured beside them.

## Measuring performance

Headless Chromium draws WebGL in software, so it makes big searches look much slower than they
are. Judge drawing speed on a real GPU, by running Playwright headed. Run Lighthouse through its
Node API with Playwright's Chromium, as `e2e/lighthouse.spec.ts` does: on WSL the CLI leaves
Chrome profile folders in the working directory.

## Commits

Make small commits that each leave the tests green. Write the message as what the change does for
the user, with the reason in the body.
