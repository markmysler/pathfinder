import type { CSSProperties } from 'react';
import { algorithms, type AlgorithmId } from '../algorithms';
import { ALGORITHM_STYLE, formatWeight } from '../ui/algorithmStyle';
import { CheckIcon } from '../ui/icons';
import styles from './AlgorithmPicker.module.css';
import { MAX_ALGORITHMS, MAX_WEIGHT, MIN_WEIGHT } from './exploreState';

interface Props {
  value: readonly AlgorithmId[];
  onToggle(algorithm: AlgorithmId): void;
  /** Most that may be ticked at once. */
  limit?: number;
  /** Weight on A*'s estimate, adjustable while A* is ticked. */
  weight?: number;
  onWeight?(weight: number): void;
}

function weightAdvice(weight: number) {
  if (weight === 1) {
    return 'At 1×, A* is guaranteed the best route. Raise it to trade route quality for speed.';
  }
  const worse = Math.round((weight - 1) * 100);
  return `At ${formatWeight(weight)}, A* trusts its estimate more than the roads. It expands fewer nodes, but its route can be up to ${worse}% worse than the best.`;
}

/** Choose one algorithm to study, or several to compare side by side. */
export function AlgorithmPicker({
  value,
  onToggle,
  limit = MAX_ALGORITHMS,
  weight = 1,
  onWeight,
}: Props) {
  const full = value.length >= limit;
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>
        <span>Algorithms</span>
        <span className={styles.count}>
          {value.length} selected · up to {limit}
        </span>
      </legend>
      {Object.values(algorithms).map(({ id, name }) => {
        const style = ALGORITHM_STYLE[id];
        const checked = value.includes(id);
        const card = (
          <label key={id} className={styles.card}>
            <input
              className={styles.box}
              type="checkbox"
              name="algorithms"
              value={id}
              checked={checked}
              disabled={full && !checked}
              onChange={() => onToggle(id)}
              aria-labelledby={`algorithm-${id}`}
              aria-describedby={`algorithm-${id}-blurb`}
            />
            <span className={styles.badge} aria-hidden="true">
              {style.badge}
            </span>
            <CheckIcon className={styles.check} size={14} strokeWidth={3} />
            <span className={styles.short} aria-hidden="true">
              {style.short}
            </span>
            <span className={styles.text}>
              <span id={`algorithm-${id}`} className={styles.name}>
                {name}
              </span>
              <span id={`algorithm-${id}-blurb`} className={styles.blurb}>
                {style.blurb}
              </span>
            </span>
          </label>
        );
        const color = { '--algo': style.color } as CSSProperties;
        if (id !== 'astar' || !checked || !onWeight) {
          return (
            <div key={id} className={styles.item} style={color}>
              {card}
            </div>
          );
        }
        return (
          <div key={id} className={`${styles.item} ${styles.withSettings}`} style={color}>
            {card}
            <div className={styles.settings}>
              <label className={styles.weight}>
                <span className={styles.weightLabel}>
                  <span>
                    <span className={styles.dot} aria-hidden="true" />
                    <span className={styles.phoneOnly}>A* estimate weight</span>
                    <span className={styles.desktopOnly}>Estimate weight</span>
                  </span>
                  <span className={styles.weightValue}>{formatWeight(weight)}</span>
                </span>
                <input
                  className={styles.range}
                  type="range"
                  aria-label="Estimate weight"
                  min={MIN_WEIGHT}
                  max={MAX_WEIGHT}
                  step={0.1}
                  value={weight}
                  onChange={(event) => onWeight(Number(event.target.value))}
                />
                <span className={styles.ticks} aria-hidden="true">
                  <span>1×</span>
                  <span>2×</span>
                  <span>3×</span>
                </span>
              </label>
              <p className={styles.advice}>{weightAdvice(weight)}</p>
            </div>
          </div>
        );
      })}
      {full && <p className={styles.limit}>Up to {limit} at once. Untick one to pick another.</p>}
    </fieldset>
  );
}
