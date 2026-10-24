import type { ReactNode } from 'react';
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
  ChevronRightIcon,
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
  /** The step where a bidirectional search's sides first met, marked on the scrubber. */
  meetAt?: number;
  /** Bellman-Ford: step buttons move a whole round, and the label says which round. */
  rounds?: { label: string; onBack(): void; onForward(): void };
  /** Says what is counted instead of "Step x of y", as replaying contraction does. */
  label?: ReactNode;
  /** Replaces "Jump to end": leave this replay for the search. */
  onSkip?(): void;
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
  meetAt,
  rounds,
  label,
  onSkip,
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
        {rounds ? (
          <button
            type="button"
            className={`${styles.button} ${styles.wordButton}`}
            aria-label="Back one round"
            onClick={rounds.onBack}
          >
            <StepBackIcon size={16} />
            {!compact && 'Round'}
          </button>
        ) : (
          <button
            type="button"
            className={styles.button}
            aria-label="Step back"
            onClick={() => onChange(stepBack)}
          >
            <StepBackIcon />
          </button>
        )}
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
        {rounds ? (
          <button
            type="button"
            className={`${styles.button} ${styles.wordButton}`}
            aria-label="Forward one round"
            onClick={rounds.onForward}
          >
            {!compact && 'Round'}
            <StepForwardIcon size={16} />
          </button>
        ) : (
          <button
            type="button"
            className={styles.button}
            aria-label="Step forward"
            onClick={() => onChange(stepForward)}
          >
            <StepForwardIcon />
          </button>
        )}
        {onSkip ? (
          <button
            type="button"
            className={`${styles.button} ${styles.wordButton}`}
            aria-label="Skip to the search"
            onClick={onSkip}
          >
            {compact ? 'Search' : <JumpToEndIcon size={16} />}
            {compact ? <ChevronRightIcon size={16} /> : 'Skip to search'}
          </button>
        ) : (
          <button
            type="button"
            className={styles.button}
            aria-label="Jump to end"
            onClick={() => onChange(jumpToEnd)}
          >
            <JumpToEndIcon />
          </button>
        )}
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
            {label ?? (
              <>
                Step <span className={styles.value}>{formatCount(step)}</span> of{' '}
                {formatCount(total)}
              </>
            )}
            {rounds && !compact && ` · ${rounds.label}`}
            {note && !compact && ` · ${note}`}
          </span>
          {meetAt !== undefined ? (
            <span className={styles.met}>
              <span className={styles.diamond} aria-hidden="true" />
              {compact ? 'met at' : 'Sides met at'}{' '}
              <span className={styles.value}>{formatCount(meetAt)}</span>
            </span>
          ) : compact ? (
            (rounds?.label ?? note) && <span>{rounds?.label ?? note}</span>
          ) : (
            !label && <span>Drag to scrub</span>
          )}
        </span>
        <span className={styles.track}>
          {meetAt !== undefined && total > 0 && (
            <span
              className={styles.meetTick}
              title={`Sides met at step ${formatCount(meetAt)}`}
              aria-hidden="true"
              style={{ left: `${(100 * meetAt) / total}%` }}
            />
          )}
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
        </span>
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
