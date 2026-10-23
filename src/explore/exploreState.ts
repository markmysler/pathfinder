import type { AlgorithmId } from '../algorithms';
import type { Place } from '../geo/nominatim';
import type { LatLon } from '../osm/area';
import type { Objective } from '../osm/network';
import type { TravelMode } from '../osm/roads';
import { initialPlayback, play, type PlaybackState } from '../playback/playback';
import type { JobResult, Stage } from '../worker/job';
import type { JobError } from '../worker/protocol';

export type Role = 'start' | 'target';

export type RunState =
  | { status: 'idle' }
  | { status: 'loading'; stage: Stage | null }
  | { status: 'failed'; error: JobError }
  | { status: 'ready'; result: JobResult; playback: PlaybackState };

export interface ExploreState {
  start: Place | null;
  target: Place | null;
  /** Which point a map click places next. */
  nextPick: Role;
  mode: TravelMode;
  objective: Objective;
  algorithm: AlgorithmId;
  run: RunState;
}

export type ExploreAction =
  | { type: 'placeChosen'; role: Role; place: Place }
  | { type: 'mapClicked'; point: LatLon }
  | { type: 'placeNamed'; role: Role; place: Place }
  | { type: 'swapped' }
  | { type: 'modeChosen'; mode: TravelMode }
  | { type: 'objectiveChosen'; objective: Objective }
  | { type: 'algorithmChosen'; algorithm: AlgorithmId }
  | { type: 'runRequested' }
  | { type: 'runProgressed'; stage: Stage }
  | { type: 'runSucceeded'; result: JobResult }
  | { type: 'runFailed'; error: JobError }
  | { type: 'editRequested' }
  | { type: 'playback'; apply: (playback: PlaybackState, total: number) => PlaybackState };

export const initialExplore: ExploreState = {
  start: null,
  target: null,
  nextPick: 'start',
  mode: 'car',
  objective: 'fastest',
  algorithm: 'astar',
  run: { status: 'idle' },
};

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
    case 'algorithmChosen':
      return { ...state, algorithm: action.algorithm };
    case 'runRequested':
      if (!state.start || !state.target) return state;
      return { ...state, run: { status: 'loading', stage: null } };
    case 'runProgressed':
      if (state.run.status !== 'loading') return state;
      return { ...state, run: { status: 'loading', stage: action.stage } };
    case 'runSucceeded': {
      if (state.run.status !== 'loading') return state;
      const playback = play(initialPlayback(), action.result.timeline.steps);
      return { ...state, run: { status: 'ready', result: action.result, playback } };
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
        run: { ...state.run, playback: action.apply(playback, result.timeline.steps) },
      };
    }
  }
}
