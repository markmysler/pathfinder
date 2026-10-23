import { initialPlayback, play, setSpeed, suggestedSpeed } from '../playback/playback';
import type { AlgorithmId } from '../algorithms';
import type { JobResult } from '../worker/job';
import {
  exploreReducer,
  initialExplore,
  MAX_ALGORITHMS,
  toggleAlgorithm,
  type ExploreState,
} from './exploreState';

const casaRosada = { name: 'Casa Rosada', detail: 'Buenos Aires', lat: -34.608, lon: -58.3703 };
const cabildo = { name: 'Cabildo', detail: 'Buenos Aires', lat: -34.6087, lon: -58.3738 };
const resultOf = (steps: Partial<Record<AlgorithmId, number>>) =>
  ({
    runs: Object.entries(steps).map(([algorithm, n]) => ({ algorithm, timeline: { steps: n } })),
  }) as unknown as JobResult;
const result = resultOf({ astar: 100 });

const ready = (r: JobResult) =>
  exploreReducer(exploreReducer(withPlaces(), { type: 'runRequested' }), {
    type: 'runSucceeded',
    result: r,
  });

const withPlaces = (): ExploreState => ({
  ...initialExplore,
  start: casaRosada,
  target: cabildo,
});

describe('exploreReducer', () => {
  it('starts with no places, by car, fastest, comparing Greedy, Dijkstra and A*', () => {
    expect(initialExplore).toMatchObject({
      start: null,
      target: null,
      nextPick: 'start',
      mode: 'car',
      objective: 'fastest',
      algorithms: ['greedy', 'dijkstra', 'astar'],
      mapsLinked: true,
      run: { status: 'idle' },
    });
  });

  it('places A, then B, from search results', () => {
    let state = exploreReducer(initialExplore, {
      type: 'placeChosen',
      role: 'start',
      place: casaRosada,
    });
    expect(state).toMatchObject({ start: casaRosada, nextPick: 'target' });
    state = exploreReducer(state, { type: 'placeChosen', role: 'target', place: cabildo });
    expect(state).toMatchObject({ target: cabildo, nextPick: 'start' });
  });

  it('drops a pin for whichever point is next when the map is clicked', () => {
    let state = exploreReducer(initialExplore, { type: 'mapClicked', point: { lat: 1, lon: 2 } });
    expect(state.start).toMatchObject({ lat: 1, lon: 2, name: '1.0000, 2.0000' });
    state = exploreReducer(state, { type: 'mapClicked', point: { lat: 3, lon: 4 } });
    expect(state.target).toMatchObject({ lat: 3, lon: 4 });
    expect(state.nextPick).toBe('start');
  });

  it('renames a dropped pin once its address is known, unless it has moved since', () => {
    let state = exploreReducer(initialExplore, { type: 'mapClicked', point: { lat: 1, lon: 2 } });
    const named = { name: 'Some street', detail: 'Town', lat: 1, lon: 2 };
    state = exploreReducer(state, { type: 'placeNamed', role: 'start', place: named });
    expect(state.start?.name).toBe('Some street');
    const moved = exploreReducer(state, {
      type: 'placeNamed',
      role: 'start',
      place: { ...named, lat: 9 },
    });
    expect(moved.start?.name).toBe('Some street');
    expect(moved.start?.lat).toBe(1);
  });

  it('moves a pin dragged on the map without changing which point is next', () => {
    const state = exploreReducer(withPlaces(), {
      type: 'pinMoved',
      role: 'target',
      point: { lat: 5, lon: 6 },
    });
    expect(state.target).toMatchObject({ lat: 5, lon: 6, detail: 'Dropped pin' });
    expect(state.nextPick).toBe(withPlaces().nextPick);
  });

  it('swaps A and B', () => {
    expect(exploreReducer(withPlaces(), { type: 'swapped' })).toMatchObject({
      start: cabildo,
      target: casaRosada,
    });
  });

  it('changes travel mode and objective', () => {
    let state = exploreReducer(initialExplore, { type: 'modeChosen', mode: 'walk' });
    state = exploreReducer(state, { type: 'objectiveChosen', objective: 'shortest' });
    expect(state).toMatchObject({ mode: 'walk', objective: 'shortest' });
  });

  it('toggles algorithms in and out, keeping them in the order they are listed', () => {
    let state = exploreReducer(initialExplore, { type: 'algorithmToggled', algorithm: 'dijkstra' });
    expect(state.algorithms).toEqual(['greedy', 'astar']);
    state = exploreReducer(state, { type: 'algorithmToggled', algorithm: 'bfs' });
    state = exploreReducer(state, { type: 'algorithmToggled', algorithm: 'dijkstra' });
    expect(state.algorithms).toEqual(['bfs', 'greedy', 'dijkstra', 'astar']);
  });

  it('caps how many algorithms run at once, since each map needs its own WebGL contexts', () => {
    expect(MAX_ALGORITHMS).toBe(6);
    expect(toggleAlgorithm(['bfs', 'astar'], 'dijkstra', 2)).toEqual(['bfs', 'astar']);
    expect(toggleAlgorithm(['bfs', 'astar'], 'astar', 2)).toEqual(['bfs']);
  });

  it('only starts a run once both places and an algorithm are set', () => {
    expect(exploreReducer(initialExplore, { type: 'runRequested' }).run.status).toBe('idle');
    const none = { ...withPlaces(), algorithms: [] };
    expect(exploreReducer(none, { type: 'runRequested' }).run.status).toBe('idle');
    expect(exploreReducer(withPlaces(), { type: 'runRequested' }).run).toEqual({
      status: 'loading',
      stage: null,
    });
  });

  it('follows the run through its stages to a result that starts playing', () => {
    let state = exploreReducer(withPlaces(), { type: 'runRequested' });
    state = exploreReducer(state, { type: 'runProgressed', stage: 'download' });
    expect(state.run).toEqual({ status: 'loading', stage: 'download' });
    state = exploreReducer(state, { type: 'runSucceeded', result });
    expect(state.run).toEqual({
      status: 'ready',
      result,
      playback: play(setSpeed(initialPlayback(), suggestedSpeed(100)), 100),
      shown: ['astar'],
    });
  });

  it('plays several searches on one clock that lasts as long as the longest', () => {
    const state = ready(resultOf({ greedy: 30, dijkstra: 400, astar: 120 }));
    expect(state.run).toMatchObject({ playback: { speed: suggestedSpeed(400) } });
    const ended = exploreReducer(state, {
      type: 'playback',
      apply: (playback, total) => ({ ...playback, position: total }),
    });
    expect(ended.run).toMatchObject({ playback: { position: 400 } });
  });

  describe('maps shown on a phone', () => {
    const five = resultOf({ bfs: 9, dfs: 9, greedy: 9, dijkstra: 9, astar: 9 });
    const shown = (state: ExploreState) => (state.run.status === 'ready' ? state.run.shown : []);
    const toggle = (state: ExploreState, algorithm: AlgorithmId) =>
      exploreReducer(state, { type: 'mapToggled', algorithm });

    it('starts with the last three searches', () => {
      expect(shown(ready(five))).toEqual(['greedy', 'dijkstra', 'astar']);
    });

    it('replaces the map picked longest ago when a fourth is picked', () => {
      const state = toggle(ready(five), 'bfs');
      expect(shown(state)).toEqual(['dijkstra', 'astar', 'bfs']);
      expect(shown(toggle(state, 'greedy'))).toEqual(['astar', 'bfs', 'greedy']);
    });

    it('hides a shown map, but always keeps one', () => {
      let state = toggle(toggle(ready(five), 'greedy'), 'dijkstra');
      expect(shown(state)).toEqual(['astar']);
      state = toggle(state, 'astar');
      expect(shown(state)).toEqual(['astar']);
    });
  });

  it("sets the weight on A*'s estimate between 1× and 3×, in tenths", () => {
    expect(initialExplore.astarWeight).toBe(1);
    const set = (weight: number) =>
      exploreReducer(initialExplore, { type: 'astarWeightChosen', weight }).astarWeight;
    expect(set(1.54)).toBe(1.5);
    expect(set(0.4)).toBe(1);
    expect(set(7)).toBe(3);
  });

  it('links and unlinks the maps', () => {
    const state = exploreReducer(initialExplore, { type: 'mapsLinkToggled' });
    expect(state.mapsLinked).toBe(false);
    expect(exploreReducer(state, { type: 'mapsLinkToggled' }).mapsLinked).toBe(true);
  });

  it('remembers which download server is being tried', () => {
    let state = exploreReducer(withPlaces(), { type: 'runRequested' });
    state = exploreReducer(state, {
      type: 'runProgressed',
      stage: 'download',
      server: { host: 'maps.mail.ru', attempt: 2 },
    });
    expect(state.run).toEqual({
      status: 'loading',
      stage: 'download',
      server: { host: 'maps.mail.ru', attempt: 2 },
    });
  });

  it('shows failures, but treats a cancellation as going back', () => {
    const loading = exploreReducer(withPlaces(), { type: 'runRequested' });
    const failed = exploreReducer(loading, {
      type: 'runFailed',
      error: { kind: 'download', message: 'busy' },
    });
    expect(failed.run).toEqual({ status: 'failed', error: { kind: 'download', message: 'busy' } });
    const cancelled = exploreReducer(loading, {
      type: 'runFailed',
      error: { kind: 'cancelled', message: 'Cancelled' },
    });
    expect(cancelled.run.status).toBe('idle');
  });

  it('ignores late progress or results after leaving the loading state', () => {
    const idle = withPlaces();
    expect(exploreReducer(idle, { type: 'runProgressed', stage: 'graph' })).toBe(idle);
    expect(exploreReducer(idle, { type: 'runSucceeded', result })).toBe(idle);
  });

  it('applies playback changes against the timeline length', () => {
    const state = exploreReducer(ready(result), {
      type: 'playback',
      apply: (playback, total) => ({ ...playback, position: total, playing: false }),
    });
    expect(state.run).toMatchObject({ playback: { position: 100, playing: false } });
  });

  it('goes back to planning, keeping the places and settings', () => {
    const editing = exploreReducer(ready(result), { type: 'editRequested' });
    expect(editing).toMatchObject({ start: casaRosada, target: cabildo, run: { status: 'idle' } });
  });
});

describe('live traffic in the explore state', () => {
  const saved = { provider: 'tomtom' as const, keys: { tomtom: 't-key' } };

  it('starts with traffic off, the dialog closed and the map layer on', () => {
    expect(initialExplore).toMatchObject({
      traffic: { provider: null, keys: {} },
      trafficDialog: false,
      trafficLayer: true,
      trafficProblem: null,
    });
  });

  it('opens and closes the key dialog', () => {
    const open = exploreReducer(initialExplore, { type: 'trafficDialogOpened' });
    expect(open.trafficDialog).toBe(true);
    expect(exploreReducer(open, { type: 'trafficDialogClosed' }).trafficDialog).toBe(false);
  });

  it('saves keys, closes the dialog and forgets an earlier problem', () => {
    const troubled = { ...initialExplore, trafficDialog: true, trafficProblem: 'key' as const };
    const state = exploreReducer(troubled, { type: 'trafficSaved', settings: saved });
    expect(state).toMatchObject({ traffic: saved, trafficDialog: false, trafficProblem: null });
  });

  it('switches traffic off and back on with a saved key', () => {
    const on = { ...initialExplore, traffic: saved };
    const off = exploreReducer(on, { type: 'trafficSwitched', on: false });
    expect(off.traffic).toEqual({ provider: null, keys: { tomtom: 't-key' } });
    expect(exploreReducer(off, { type: 'trafficSwitched', on: true }).traffic).toEqual(saved);
    const onlyHere = { ...initialExplore, traffic: { provider: null, keys: { here: 'h' } } };
    expect(exploreReducer(onlyHere, { type: 'trafficSwitched', on: true }).traffic.provider).toBe(
      'here',
    );
    // Without any key there is nothing to switch on.
    expect(exploreReducer(initialExplore, { type: 'trafficSwitched', on: true })).toBe(
      initialExplore,
    );
  });

  it('counts traffic tiles while loading', () => {
    const loading = exploreReducer(withPlaces(), { type: 'runRequested' });
    const state = exploreReducer(loading, { type: 'trafficProgressed', done: 3, total: 36 });
    expect(state.run).toMatchObject({ status: 'loading', traffic: { done: 3, total: 36 } });
    const later = exploreReducer(state, { type: 'runProgressed', stage: 'traffic' });
    expect(later.run).toMatchObject({ stage: 'traffic', traffic: { done: 3, total: 36 } });
    expect(exploreReducer(initialExplore, { type: 'trafficProgressed', done: 1, total: 1 })).toBe(
      initialExplore,
    );
  });

  it('remembers why traffic failed on the last run, until it works again', () => {
    const failed = {
      ...result,
      traffic: { status: 'failed', provider: 'tomtom', reason: 'key' },
    } as JobResult;
    const state = ready(failed);
    expect(state.trafficProblem).toBe('key');
    const live = { ...result, traffic: { status: 'live' } } as unknown as JobResult;
    const again = exploreReducer(
      exploreReducer({ ...state, run: { status: 'idle' } }, { type: 'runRequested' }),
      { type: 'runSucceeded', result: live },
    );
    expect(again.trafficProblem).toBeNull();
  });

  it('shows or hides the traffic layer', () => {
    const hidden = exploreReducer(initialExplore, { type: 'trafficLayerToggled' });
    expect(hidden.trafficLayer).toBe(false);
  });
});
