import type { CSSProperties } from 'react';
import { algorithms, type AlgorithmId } from '../algorithms';
import { ALGORITHM_STYLE } from '../ui/algorithmStyle';
import styles from './AlgorithmPicker.module.css';

interface Props {
  value: AlgorithmId;
  onChange(algorithm: AlgorithmId): void;
}

/** One algorithm per run for now; comparing several arrives with side-by-side maps. */
export function AlgorithmPicker({ value, onChange }: Props) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>Algorithm</legend>
      {Object.values(algorithms).map(({ id, name }) => {
        const style = ALGORITHM_STYLE[id];
        return (
          <label
            key={id}
            className={styles.card}
            style={{ '--algo': style.color } as CSSProperties}
          >
            <input
              className={styles.radio}
              type="radio"
              name="algorithm"
              value={id}
              checked={id === value}
              onChange={() => onChange(id)}
              aria-labelledby={`algorithm-${id}`}
              aria-describedby={`algorithm-${id}-blurb`}
            />
            <span className={styles.badge} aria-hidden="true">
              {style.badge}
            </span>
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
      })}
    </fieldset>
  );
}
