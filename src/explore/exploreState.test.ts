import { initialPlayback, play } from '../playback/playback';
import type { JobResult } from '../worker/job';
import { exploreReducer, initialExplore, type ExploreState } from './exploreState';

const casaRosada = { name: 'Casa Rosada', detail: 'Buenos Aires', lat: -34.608, lon: -58.3703 };
const cabildo = { name: 'Cabildo', detail: 'Buenos Aires', lat: -34.6087, lon: -58.3738 };
const result = { timeline: { steps: 100 } } as unknown as JobResult;

const withPlaces = (): ExploreState => ({
  ...initialExplore,
  start: casaRosada,
  target: cabildo,
});

describe('exploreReducer', () => {
  it('starts with no places, by car, fastest, using A*', () => {
    expect(initialExplore).toMatchObject({
      start: null,
      target: null,
      nextPick: 'start',
      mode: 'car',
      objective: 'fastest',
      algorithm: 'astar',
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

  it('swaps A and B', () => {
    expect(exploreReducer(withPlaces(), { type: 'swapped' })).toMatchObject({
      start: cabildo,
      target: casaRosada,
    });
  });

  it('changes travel mode, objective and algorithm', () => {
    let state = exploreReducer(initialExplore, { type: 'modeChosen', mode: 'walk' });
    state = exploreReducer(state, { type: 'objectiveChosen', objective: 'shortest' });
    state = exploreReducer(state, { type: 'algorithmChosen', algorithm: 'dijkstra' });
    expect(state).toMatchObject({ mode: 'walk', objective: 'shortest', algorithm: 'dijkstra' });
  });

  it('only starts a run once both places are set', () => {
    expect(exploreReducer(initialExplore, { type: 'runRequested' }).run.status).toBe('idle');
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
    expect(state.run).toEqual({ status: 'ready', result, playback: play(initialPlayback(), 100) });
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
    let state = exploreReducer(exploreReducer(withPlaces(), { type: 'runRequested' }), {
      type: 'runSucceeded',
      result,
    });
    state = exploreReducer(state, {
      type: 'playback',
      apply: (playback, total) => ({ ...playback, position: total, playing: false }),
    });
    expect(state.run).toMatchObject({ playback: { position: 100, playing: false } });
  });

  it('goes back to planning, keeping the places and settings', () => {
    const ready = exploreReducer(exploreReducer(withPlaces(), { type: 'runRequested' }), {
      type: 'runSucceeded',
      result,
    });
    const editing = exploreReducer(ready, { type: 'editRequested' });
    expect(editing).toMatchObject({ start: casaRosada, target: cabildo, run: { status: 'idle' } });
  });
});
