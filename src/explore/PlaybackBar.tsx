import {
  formatSpeed,
  jumpToEnd,
  pause,
  play,
  restart,
  seek,
  setSpeed,
  sliderToSpeed,
  speedToSlider,
  stepBack,
  stepForward,
  type PlaybackState,
} from '../playback/playback';
import { formatCount } from '../ui/format';
import {
  JumpToEndIcon,
  PauseIcon,
  PlayIcon,
  RestartIcon,
  StepBackIcon,
  StepForwardIcon,
} from '../ui/icons';
import styles from './PlaybackBar.module.css';

type Change = (playback: PlaybackState, total: number) => PlaybackState;

interface Props {
  playback: PlaybackState;
  total: number;
  onChange(apply: Change): void;
  /** Compact swaps the speed slider for a button that cycles preset speeds (phones). */
  variant?: 'full' | 'compact';
}

const PRESET_SPEEDS = [0.1, 0.3, 1, 3, 10, 30, 100];
const nextPreset = (speed: number) =>
  PRESET_SPEEDS.find((s) => s > speed + 1e-9) ?? PRESET_SPEEDS[0]!;

export function PlaybackBar({ playback, total, onChange, variant = 'full' }: Props) {
  const step = Math.floor(playback.position);
  const speedLabel = formatSpeed(playback.speed);
  const compact = variant === 'compact';

  return (
    <div
      className={`${styles.bar} ${compact ? styles.compact : ''}`}
      aria-label="Playback"
      role="group"
    >
      <div className={styles.buttons}>
        <button
          type="button"
          className={styles.button}
          aria-label="Restart"
          onClick={() => onChange(restart)}
        >
          <RestartIcon />
        </button>
        <button
          type="button"
          className={styles.button}
          aria-label="Step back"
          onClick={() => onChange(stepBack)}
        >
          <StepBackIcon />
        </button>
        {playback.playing ? (
          <button
            type="button"
            className={styles.play}
            aria-label="Pause"
            onClick={() => onChange(pause)}
          >
            <PauseIcon size={20} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.play}
            aria-label="Play"
            onClick={() => onChange(play)}
          >
            <PlayIcon size={20} />
          </button>
        )}
        <button
          type="button"
          className={styles.button}
          aria-label="Step forward"
          onClick={() => onChange(stepForward)}
        >
          <StepForwardIcon />
        </button>
        <button
          type="button"
          className={styles.button}
          aria-label="Jump to end"
          onClick={() => onChange(jumpToEnd)}
        >
          <JumpToEndIcon />
        </button>
        {compact && (
          <button
            type="button"
            className={styles.speedButton}
            aria-label={`Speed ${speedLabel}. Change speed`}
            onClick={() => onChange((p) => setSpeed(p, nextPreset(p.speed)))}
          >
            {speedLabel}
          </button>
        )}
      </div>

      <label className={styles.scrubber}>
        <span className={styles.labels}>
          <span>
            Step <span className={styles.value}>{formatCount(step)}</span> of {formatCount(total)}
          </span>
          {!compact && <span>Drag to scrub</span>}
        </span>
        <input
          className={styles.range}
          type="range"
          aria-label="Step"
          min={0}
          max={total}
          step={1}
          value={step}
          onChange={(event) => {
            const position = Number(event.target.value);
            onChange((p, t) => seek(p, position, t));
          }}
        />
      </label>

      {!compact && (
        <label className={styles.speed}>
          <span className={styles.labels}>
            <span>Speed</span>
            <span className={styles.value}>{speedLabel}</span>
          </span>
          <input
            className={styles.range}
            type="range"
            aria-label={`Speed ${speedLabel}`}
            min={0}
            max={3}
            step={0.01}
            value={speedToSlider(playback.speed)}
            onChange={(event) => {
              const speed = sliderToSpeed(Number(event.target.value));
              onChange((p) => setSpeed(p, speed));
            }}
          />
          <span className={styles.ticks} aria-hidden="true">
            <span>0.1×</span>
            <span>1×</span>
            <span>10×</span>
            <span>100×</span>
          </span>
        </label>
      )}
    </div>
  );
}
