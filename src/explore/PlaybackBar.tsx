import {
  formatSpeed,
  PRESET_SPEEDS,
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

export type PlaybackChange = (playback: PlaybackState, total: number) => PlaybackState;

export interface FinishMark {
  label: string;
  color: string;
  step: number;
}

interface Props {
  playback: PlaybackState;
  total: number;
  onChange(apply: PlaybackChange): void;
  /** Compact swaps the speed slider for a button that cycles preset speeds (phones). */
  variant?: 'full' | 'compact';
  /** What the clock drives, e.g. "one clock for every map". */
  note?: string;
  /** Searches that end before the clock does, marked under the scrubber. */
  marks?: readonly FinishMark[];
}

/** Marks too close to fit side by side alternate between two rows. */
function placeMarks(marks: readonly FinishMark[], total: number) {
  let previous = -Infinity;
  let row = 0;
  return [...marks]
    .sort((a, b) => a.step - b.step)
    .map((mark) => {
      const left = (100 * mark.step) / total;
      row = left - previous < 8 ? 1 - row : 0;
      previous = left;
      return { ...mark, left, row };
    });
}

const nextPreset = (speed: number) =>
  PRESET_SPEEDS.find((s) => s > speed + 1e-9) ?? PRESET_SPEEDS[0]!;

export function PlaybackBar({
  playback,
  total,
  onChange,
  variant = 'full',
  note,
  marks = [],
}: Props) {
  const step = Math.floor(playback.position);
  const speedLabel = formatSpeed(playback.speed);
  const compact = variant === 'compact';
  const placed = total > 0 ? placeMarks(marks, total) : [];

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
            {note && !compact && ` · ${note}`}
          </span>
          {compact ? note && <span>{note}</span> : <span>Drag to scrub</span>}
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
        {placed.length > 0 && (
          <ul
            className={styles.marks}
            aria-label="Where each search finished"
            data-rows={placed.some((mark) => mark.row) ? 2 : 1}
          >
            {placed.map((mark) => (
              <li
                key={mark.label}
                aria-label={`${mark.label} finished at step ${formatCount(mark.step)}`}
                style={{ left: `${mark.left}%`, top: mark.row * 16, color: mark.color }}
              >
                {mark.label}
              </li>
            ))}
          </ul>
        )}
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
