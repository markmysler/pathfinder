import type { Timeline } from '../playback/timeline';
import { describeStep, searchStatus } from './narration';

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
