/** Playback position is measured in steps (expansions) and may be fractional while playing. */
export interface PlaybackState {
  position: number;
  playing: boolean;
  /** Multiplier on STEPS_PER_SECOND_AT_1X, between MIN_SPEED and MAX_SPEED. */
  speed: number;
}

export const STEPS_PER_SECOND_AT_1X = 200;
export const MIN_SPEED = 0.1;
export const MAX_SPEED = 100;

export const initialPlayback = (): PlaybackState => ({ position: 0, playing: false, speed: 10 });

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function tick(state: PlaybackState, elapsedMs: number, total: number): PlaybackState {
  if (!state.playing) return state;
  const position = state.position + (elapsedMs / 1000) * STEPS_PER_SECOND_AT_1X * state.speed;
  return position >= total ? { ...state, position: total, playing: false } : { ...state, position };
}

/** Plays from the current position, or from the beginning if already at the end. */
export const play = (state: PlaybackState, total: number): PlaybackState => ({
  ...state,
  position: state.position >= total ? 0 : state.position,
  playing: true,
});

export const pause = (state: PlaybackState): PlaybackState => ({ ...state, playing: false });

export const restart = (state: PlaybackState): PlaybackState => ({
  ...state,
  position: 0,
  playing: true,
});

export const jumpToEnd = (state: PlaybackState, total: number): PlaybackState => ({
  ...state,
  position: total,
  playing: false,
});

export const stepForward = (state: PlaybackState, total: number): PlaybackState => ({
  ...state,
  position: Math.min(total, Math.floor(state.position) + 1),
  playing: false,
});

export const stepBack = (state: PlaybackState): PlaybackState => ({
  ...state,
  position: Math.max(0, Math.ceil(state.position) - 1),
  playing: false,
});

export const seek = (state: PlaybackState, position: number, total: number): PlaybackState => ({
  ...state,
  position: clamp(position, 0, total),
});

export const setSpeed = (state: PlaybackState, speed: number): PlaybackState => ({
  ...state,
  speed: clamp(speed, MIN_SPEED, MAX_SPEED),
});

/** The speed slider runs 0..3, one unit per factor of ten from 0.1× to 100×. */
export const sliderToSpeed = (value: number) => 10 ** (value - 1);
export const speedToSlider = (speed: number) => Math.log10(speed) + 1;

export function formatSpeed(speed: number): string {
  const rounded = speed < 10 ? Math.round(speed * 10) / 10 : Math.round(speed);
  return `${rounded}×`;
}

/** Speeds offered by the compact speed button, and used to pick a starting speed. */
export const PRESET_SPEEDS = [0.1, 0.3, 1, 3, 10, 30, 100];
const TARGET_SECONDS = 15;

/** The preset speed that plays a search of `steps` expansions in about 15 seconds. */
export function suggestedSpeed(steps: number): number {
  const ideal = Math.log10(steps / (TARGET_SECONDS * STEPS_PER_SECOND_AT_1X));
  return PRESET_SPEEDS.reduce((best, speed) =>
    Math.abs(Math.log10(speed) - ideal) < Math.abs(Math.log10(best) - ideal) ? speed : best,
  );
}
