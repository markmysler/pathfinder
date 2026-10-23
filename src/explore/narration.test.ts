import { algorithms, type AlgorithmId } from '../algorithms';
import { runSearch } from '../algorithms/trace';
import { partsOfStep } from '../playback/frontier';
import { stopCheck } from '../playback/sides';
import { buildTimeline, type Timeline } from '../playback/timeline';
import { undirectedGraphFrom } from '../test/fixtures';
import {
  describePart,
  describeStep,
  describeStopCheck,
  describeTurn,
  searchStatus,
} from './narration';

// Only the fields narration reads, with easy numbers: step 1 has g 372, h 303, 2 of 3 roads pushed.
const timeline = (overrides: Partial<Timeline> = {}) =>
  ({
    steps: 4,
    expandedCost: Float64Array.from([0, 372, 500, 610, 900]),
    expandedEstimate: Float64Array.from([0, 303, 100, 40, 0]),
    pushesAt: Uint32Array.from([0, 2, 1, 0, 0]),
    expandedDegree: Uint32Array.from([0, 3, 3, 0, 2]),
    route: { cost: 872, meters: 900, positions: new Float64Array() },
    ...overrides,
  }) as Timeline;

describe('describeStep', () => {
  it('explains the starting point', () => {
    expect(describeStep(timeline(), 0, 'astar', 'shortest')).toBe(
      'Start: A is the only node in the frontier.',
    );
  });

  it('explains what A* weighed and what changed', () => {
    expect(describeStep(timeline(), 1, 'astar', 'shortest')).toBe(
      'Took the frontier node with the lowest f = g + h: 372 m + 303 m = 675 m. ' +
        '2 of 3 roads reached a neighbour more cheaply. They joined the frontier.',
    );
  });

  it('shows the weight when A* weighs its estimate', () => {
    expect(describeStep(timeline(), 1, 'astar', 'shortest', 1.5)).toMatch(
      /^Took the frontier node with the lowest f = g \+ 1\.5 × h: 372 m \+ 1\.5 × 303 m = 827 m\. /,
    );
  });

  it('describes each algorithm by its own rule for picking the next node', () => {
    expect(describeStep(timeline(), 1, 'dijkstra', 'shortest')).toBe(
      'Took the frontier node with the lowest cost so far, 372 m. ' +
        '2 of 3 roads reached a neighbour more cheaply. They joined the frontier.',
    );
    expect(describeStep(timeline(), 1, 'greedy', 'shortest')).toBe(
      'Took the frontier node that looks closest to B (estimate 303 m). ' +
        '2 of 3 roads led somewhere new. They joined the frontier.',
    );
    expect(describeStep(timeline(), 1, 'bfs', 'shortest')).toBe(
      'Took the oldest node in the queue. 2 of 3 roads led somewhere new. They joined the frontier.',
    );
    expect(describeStep(timeline(), 1, 'dfs', 'shortest')).toBe(
      'Took the newest node on the stack. ' +
        '2 of 3 roads led somewhere not yet explored. They joined the frontier.',
    );
  });

  it('uses the singular for a single new frontier node', () => {
    expect(describeStep(timeline(), 2, 'bfs', 'shortest')).toBe(
      'Took the oldest node in the queue. 1 of 3 roads led somewhere new. It joined the frontier.',
    );
  });

  it('reads naturally when no road, or the only road, adds to the frontier', () => {
    const t = (pushes: number, degree: number) =>
      timeline({
        pushesAt: Uint32Array.from([0, pushes, 0, 0, 0]),
        expandedDegree: Uint32Array.from([0, degree, 0, 0, 0]),
      });
    expect(describeStep(t(0, 3), 1, 'dijkstra', 'shortest')).toMatch(
      / None of its 3 roads reached a neighbour more cheaply\.$/,
    );
    expect(describeStep(t(1, 1), 1, 'dijkstra', 'shortest')).toMatch(
      / Its only road reached a neighbour more cheaply\. It joined the frontier\.$/,
    );
    expect(describeStep(t(0, 1), 1, 'dijkstra', 'shortest')).toMatch(
      / Its only road did not reach a neighbour more cheaply\.$/,
    );
    expect(describeStep(t(0, 1), 1, 'bfs', 'shortest')).toMatch(
      / Its only road did not lead anywhere new\.$/,
    );
    expect(describeStep(t(0, 2), 1, 'dfs', 'shortest')).toMatch(
      / None of its 2 roads led anywhere not yet explored\.$/,
    );
  });

  it('calls out dead ends', () => {
    expect(describeStep(timeline(), 3, 'bfs', 'shortest')).toBe(
      'Took the oldest node in the queue. It is a dead end.',
    );
  });

  it('writes costs as travel times for the fastest route', () => {
    expect(describeStep(timeline(), 1, 'dijkstra', 'fastest')).toMatch(
      /^Took the frontier node with the lowest cost so far, 6:12\./,
    );
  });

  it('announces the route at the final step', () => {
    expect(describeStep(timeline(), 4, 'astar', 'fastest')).toBe(
      'Reached B. The route takes 14:32.',
    );
    expect(describeStep(timeline(), 4, 'astar', 'shortest')).toBe(
      'Reached B. The route is 872 m long.',
    );
  });

  it('explains a search that ran out of frontier', () => {
    expect(describeStep(timeline({ route: null }), 4, 'bfs', 'shortest')).toBe(
      'The frontier is empty: there is no route to B.',
    );
  });
});

describe('searchStatus', () => {
  it('is searching until the last step, then reports the outcome', () => {
    expect(searchStatus(timeline(), 0)).toBe('searching');
    expect(searchStatus(timeline(), 3.5)).toBe('searching');
    expect(searchStatus(timeline(), 4)).toBe('found');
    expect(searchStatus(timeline({ route: null }), 4)).toBe('no-route');
  });
});

describe('describePart', () => {
  // Hand-built entries: 0 is A (the source), 1 and 2 were pushed by step 1, 3 is outdated.
  const t = {
    entryNode: Uint32Array.from([0, 1, 2, 1]),
    entryCost: Float64Array.from([0, 120, 300, 200]),
    entryEstimate: Float64Array.from([400, 310, 150, 310]),
    entryPrevious: Float64Array.from([Infinity, 200, Infinity, Infinity]),
    expandedEntry: Uint32Array.from([0, 0, 2]),
    pushesAt: Uint32Array.from([0, 2, 0]),
  } as unknown as Timeline;
  const names = { labels: ['Perú', 'Bolívar & Perú'], nodeLabel: Int32Array.from([0, 1, -1]) };
  const say = (part: Parameters<typeof describePart>[0], algorithm: AlgorithmId, step = 1) =>
    describePart(part, { timeline: t, step, algorithm, objective: 'shortest', weight: 1, names });

  it('names the node taken and why it was chosen', () => {
    expect(say({ kind: 'take', entry: 0 }, 'astar')).toBe(
      'Took Perú, the frontier node with the lowest f = g + h: 0 m + 400 m = 400 m.',
    );
    expect(say({ kind: 'take', entry: 0 }, 'bfs')).toBe('Took Perú, the oldest node in the queue.');
  });

  it('works through a road that improved its end, with the arithmetic', () => {
    expect(say({ kind: 'road', entry: 1 }, 'dijkstra')).toBe(
      'Road to Bolívar & Perú, 120 m long: 0 m + 120 m = 120 m beats the best known way there, 200 m, so it joins the frontier with g = 120 m.',
    );
    expect(say({ kind: 'road', entry: 2 }, 'astar')).toBe(
      'Road to Unnamed road, 300 m long: 0 m + 300 m = 300 m is the first way found there, so it joins the frontier with f = 300 m + 150 m = 450 m.',
    );
    expect(say({ kind: 'road', entry: 2 }, 'bfs')).toBe(
      'Road to Unnamed road: not seen before, so it joins the queue.',
    );
    expect(say({ kind: 'road', entry: 2 }, 'dfs')).toBe(
      'Road to Unnamed road: not expanded yet, so it goes on the stack.',
    );
  });

  it('gives short travel times in tenths of a second, so they do not read as zero', () => {
    const fast = describePart(
      { kind: 'road', entry: 1 },
      {
        timeline: { ...t, entryCost: Float64Array.from([0, 0.4, 300, 200]) } as unknown as Timeline,
        step: 1,
        algorithm: 'dijkstra',
        objective: 'fastest',
        weight: 1,
        names,
      },
    );
    expect(fast).toMatch(/^Road to Bolívar & Perú, taking 0\.4 s: 0:00 \+ 0\.4 s = 0:00/);
  });

  it('explains roads that led nowhere better, skips and the goal', () => {
    expect(say({ kind: 'rejected', count: 2 }, 'astar')).toBe(
      'The other 2 roads did not reach anywhere more cheaply.',
    );
    expect(say({ kind: 'rejected', count: 1 }, 'greedy')).toBe(
      'The other road led somewhere already seen.',
    );
    expect(say({ kind: 'skip', entry: 3 }, 'dijkstra')).toBe(
      'Took an entry for Bolívar & Perú, but it is outdated: a cheaper way there was found later. Skipped it.',
    );
    expect(say({ kind: 'skip', entry: 3 }, 'dfs')).toBe(
      'Took an entry for Bolívar & Perú, but it was already expanded. Skipped it.',
    );
    expect(say({ kind: 'goal' }, 'astar', 2)).toBe(
      'Unnamed road is B. The search stops and follows the roads it came by back to A.',
    );
  });
});

describe('searches from both ends', () => {
  // S – P costs 100 and P – T 1,000; the long way round, S – Q – R – T, costs 200 a road.
  const graph = undirectedGraphFrom([
    [0, 1, 100],
    [1, 4, 1000],
    [0, 2, 200],
    [2, 3, 200],
    [3, 4, 200],
  ]);
  const names = {
    labels: ['S', 'P', 'Q', 'R', 'T'],
    nodeLabel: Int32Array.from([0, 1, 2, 3, 4]),
  };
  const solve = (algorithm: AlgorithmId) =>
    buildTimeline(
      graph,
      runSearch(algorithms[algorithm].search, { graph, source: 0, target: 4 }),
      undefined,
      algorithms[algorithm].frontier,
    );
  const t = solve('bidijkstra');
  const context = (step: number) => ({
    timeline: t,
    step,
    algorithm: 'bidijkstra' as const,
    objective: 'shortest' as const,
    weight: 1,
    names,
  });
  const part = (step: number, kind: string) => partsOfStep(t, step).find((p) => p.kind === kind)!;

  it('says which side took each step, and how the meeting stands', () => {
    expect(describeStep(t, 0, 'bidijkstra', 'shortest')).toBe(
      'Start: A is in the frontier from A, and B in the frontier from B.',
    );
    expect(describeStep(t, 2, 'bidijkstra', 'shortest')).toBe(
      'From B: took the node nearest B (0 m). 2 of 2 roads reached a neighbour more cheaply. ' +
        'They joined the frontier. The sides meet: a route of 1.1 km, the best so far.',
    );
    expect(describeStep(t, 3, 'bidijkstra', 'shortest')).toBe(
      'From A: took the node nearest A (100 m). 1 of 2 roads reached a neighbour more cheaply. ' +
        'It joined the frontier. Best route so far: 1.1 km. Still checking for a cheaper one.',
    );
    expect(describeStep(t, t.steps, 'bidijkstra', 'shortest')).toBe(
      'The sides met and nothing cheaper is left. The route is 600 m long.',
    );
  });

  it('explains why a side took the step', () => {
    expect(describeTurn(t, 2, 'bidijkstra', 'shortest', names)).toBe(
      "B's next node, T, was nearer to B (0 m) than A's next was to A (100 m), so B took this step.",
    );
    expect(describeTurn(t, 4, 'bidijkstra', 'shortest', names)).toBe(
      "Both sides' next nodes were 200 m from their ends. A goes first on a tie, so it took Q.",
    );
    const bfs = solve('bibfs');
    expect(describeTurn(bfs, 2, 'bibfs', 'shortest', names)).toBe(
      "B's next node, T, was fewer roads from B (0) than A's next was from A (1), so B took this step.",
    );
  });

  it('tells apart costs that would read the same', () => {
    // S – M – N – T: A's side reaches M at 10.2 s, B's reaches N at 10.4 s.
    const close = undirectedGraphFrom([
      [0, 1, 10.2],
      [1, 2, 50],
      [2, 3, 10.4],
    ]);
    const timeline = buildTimeline(
      close,
      runSearch(algorithms.bidijkstra.search, { graph: close, source: 0, target: 3 }),
    );
    const labels = { labels: ['S', 'M', 'N', 'T'], nodeLabel: Int32Array.from([0, 1, 2, 3]) };
    expect(describeTurn(timeline, 3, 'bidijkstra', 'fastest', labels)).toBe(
      "A's next node, M, was nearer to A (0:10.2) than B's next was to B (0:10.4), so A took this step.",
    );
  });

  it('describes roads going backward, meetings and the stop', () => {
    const backward = partsOfStep(t, 2).find((p) => p.kind === 'road')!;
    expect(describePart(backward, context(2))).toBe(
      'Road from P, 1.0 km long: 0 m + 1.0 km = 1.0 km to B is the first way found there, ' +
        "so it joins B's frontier with g = 1.0 km.",
    );
    expect(describePart(part(4, 'road'), context(4))).toBe(
      'Road to R, 200 m long: 200 m + 200 m = 400 m from A is the first way found there, ' +
        "so it joins A's frontier with g = 400 m.",
    );
    expect(describePart(part(4, 'meet'), context(4))).toBe(
      'B had already reached R, 200 m to B, so the sides meet: 400 m + 200 m = 600 m, ' +
        'the best route so far.',
    );
    expect(describePart(part(4, 'stop'), context(4))).toBe(
      'Next from A + next from B: 400 m + 200 m = 600 m, no less than the best route, 600 m. ' +
        'Nothing left can beat it, so the search stops.',
    );
  });

  it('says whether the search can stop yet', () => {
    const say = (step: number, algorithm: AlgorithmId = 'bidijkstra') =>
      describeStopCheck(stopCheck(t, step), algorithm, 'shortest');
    expect(say(1)).toBe('Not yet: the sides have not met, so there is no route to beat.');
    expect(say(3)).toBe(
      'Not quite. A route through roads neither side has explored yet would cost at least ' +
        '400 m, which could still beat 1.1 km.',
    );
    expect(say(3, 'biastar')).toBe(
      'Not quite. The next priorities add up to 400 m, under the best route, 1.1 km, so ' +
        'something cheaper could still turn up.',
    );
    expect(say(4)).toBe('Yes. Nothing left can beat 600 m: the route is final.');
    expect(
      describeStopCheck(
        { next: [Infinity, 3], sum: Infinity, best: Infinity, canStop: true },
        'bidijkstra',
        'shortest',
      ),
    ).toBe('Yes: a side ran out of roads without meeting the other, so there is no route.');
  });
});
