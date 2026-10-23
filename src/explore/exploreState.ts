import { algorithms, type AlgorithmId } from '../algorithms';
import type { Place } from '../geo/nominatim';
import type { LatLon } from '../osm/area';
import type { Objective } from '../osm/network';
import type { TravelMode } from '../osm/roads';
import {
  initialPlayback,
  play,
  setSpeed,
  suggestedSpeed,
  type PlaybackState,
} from '../playback/playback';
import type { JobResult, ServerAttempt, Stage } from '../worker/job';
import type { JobError } from '../worker/protocol';
import { totalSteps } from './comparison';

export type Role = 'start' | 'target';

export type RunState =
  | { status: 'idle' }
  | { status: 'loading'; stage: Stage | null; server?: ServerAttempt }
  | { status: 'failed'; error: JobError }
  | {
      status: 'ready';
      result: JobResult;
      playback: PlaybackState;
      /** Maps shown when only a few fit (phones), the one picked longest ago first. */
      shown: AlgorithmId[];
    };

/** How many stacked maps fit on a phone. */
export const MAX_SHOWN_MAPS = 3;

export interface ExploreState {
  start: Place | null;
  target: Place | null;
  /** Which point a map click places next. */
  nextPick: Role;
  mode: TravelMode;
  objective: Objective;
  /** Chosen algorithms, in the order they are listed. */
  algorithms: AlgorithmId[];
  /** Whether panning or zooming one comparison map moves the others. */
  mapsLinked: boolean;
  run: RunState;
}

export type ExploreAction =
  | { type: 'placeChosen'; role: Role; place: Place }
  | { type: 'mapClicked'; point: LatLon }
  | { type: 'pinMoved'; role: Role; point: LatLon }
  | { type: 'placeNamed'; role: Role; place: Place }
  | { type: 'swapped' }
  | { type: 'modeChosen'; mode: TravelMode }
  | { type: 'objectiveChosen'; objective: Objective }
  | { type: 'algorithmToggled'; algorithm: AlgorithmId }
  | { type: 'runRequested' }
  | { type: 'runProgressed'; stage: Stage; server?: ServerAttempt }
  | { type: 'runSucceeded'; result: JobResult }
  | { type: 'runFailed'; error: JobError }
  | { type: 'editRequested' }
  | { type: 'mapToggled'; algorithm: AlgorithmId }
  | { type: 'mapsLinkToggled' }
  | { type: 'playback'; apply: (playback: PlaybackState, total: number) => PlaybackState };

export const initialExplore: ExploreState = {
  start: null,
  target: null,
  nextPick: 'start',
  mode: 'car',
  objective: 'fastest',
  algorithms: ['greedy', 'dijkstra', 'astar'],
  mapsLinked: true,
  run: { status: 'idle' },
};

const LISTED = Object.keys(algorithms) as AlgorithmId[];

/**
 * Most algorithms one run may compare. Each desktop map takes two WebGL contexts (MapLibre and
 * the deck.gl overlay) and browsers allow about 16, so 6 maps leave some to spare.
 */
export const MAX_ALGORITHMS = 6;

/** Ticks or unticks an algorithm, keeping the listed order; past the limit, ticking does nothing. */
export function toggleAlgorithm(
  chosen: readonly AlgorithmId[],
  algorithm: AlgorithmId,
  limit = MAX_ALGORITHMS,
): AlgorithmId[] {
  const next = new Set(chosen);
  if (!next.delete(algorithm)) {
    if (next.size >= limit) return [...chosen];
    next.add(algorithm);
  }
  return LISTED.filter((id) => next.has(id));
}

/** Shows or hides a map; past the limit, the map picked longest ago makes way. */
function toggledMap(shown: readonly AlgorithmId[], algorithm: AlgorithmId): AlgorithmId[] {
  if (shown.includes(algorithm)) {
    return shown.length > 1 ? shown.filter((id) => id !== algorithm) : [...shown];
  }
  return [...shown, algorithm].slice(-MAX_SHOWN_MAPS);
}

const other = (role: Role): Role => (role === 'start' ? 'target' : 'start');

const droppedPin = ({ lat, lon }: LatLon): Place => ({
  name: `${lat.toFixed(4)}, ${lon.toFixed(4)}`,
  detail: 'Dropped pin',
  lat,
  lon,
});

export function exploreReducer(state: ExploreState, action: ExploreAction): ExploreState {
  switch (action.type) {
    case 'placeChosen':
      return { ...state, [action.role]: action.place, nextPick: other(action.role) };
    case 'mapClicked':
      return {
        ...state,
        [state.nextPick]: droppedPin(action.point),
        nextPick: other(state.nextPick),
      };
    case 'pinMoved':
      return { ...state, [action.role]: droppedPin(action.point) };
    case 'placeNamed': {
      const current = state[action.role];
      const unmoved = current?.lat === action.place.lat && current.lon === action.place.lon;
      return unmoved ? { ...state, [action.role]: action.place } : state;
    }
    case 'swapped':
      return { ...state, start: state.target, target: state.start };
    case 'modeChosen':
      return { ...state, mode: action.mode };
    case 'objectiveChosen':
      return { ...state, objective: action.objective };
    case 'algorithmToggled':
      return { ...state, algorithms: toggleAlgorithm(state.algorithms, action.algorithm) };
    case 'mapsLinkToggled':
      return { ...state, mapsLinked: !state.mapsLinked };
    case 'runRequested':
      if (!state.start || !state.target || state.algorithms.length === 0) return state;
      return { ...state, run: { status: 'loading', stage: null } };
    case 'runProgressed':
      if (state.run.status !== 'loading') return state;
      return { ...state, run: { status: 'loading', stage: action.stage, server: action.server } };
    case 'runSucceeded': {
      if (state.run.status !== 'loading') return state;
      const { runs } = action.result;
      const steps = totalSteps(runs);
      const playback = play(setSpeed(initialPlayback(), suggestedSpeed(steps)), steps);
      const shown = runs.slice(-MAX_SHOWN_MAPS).map((run) => run.algorithm);
      return { ...state, run: { status: 'ready', result: action.result, playback, shown } };
    }
    case 'runFailed':
      if (state.run.status !== 'loading') return state;
      if (action.error.kind === 'cancelled') return { ...state, run: { status: 'idle' } };
      return { ...state, run: { status: 'failed', error: action.error } };
    case 'editRequested':
      return { ...state, run: { status: 'idle' } };
    case 'playback': {
      if (state.run.status !== 'ready') return state;
      const { result, playback } = state.run;
      return {
        ...state,
        run: { ...state.run, playback: action.apply(playback, totalSteps(result.runs)) },
      };
    }
    case 'mapToggled':
      if (state.run.status !== 'ready') return state;
      return {
        ...state,
        run: { ...state.run, shown: toggledMap(state.run.shown, action.algorithm) },
      };
  }
}
