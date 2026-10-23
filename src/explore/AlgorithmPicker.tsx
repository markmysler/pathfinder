import type { CSSProperties } from 'react';
import { algorithms, type AlgorithmId } from '../algorithms';
import { ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { CheckIcon } from '../ui/icons';
import styles from './AlgorithmPicker.module.css';

interface Props {
  value: readonly AlgorithmId[];
  onToggle(algorithm: AlgorithmId): void;
}

/** Choose one algorithm to study, or several to compare side by side. */
export function AlgorithmPicker({ value, onToggle }: Props) {
  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>
        <span>Algorithms</span>
        <span className={styles.count}>{value.length} selected</span>
      </legend>
      {Object.values(algorithms).map(({ id, name }) => {
        const style = ALGORITHM_STYLE[id];
        return (
          <label
            key={id}
            className={styles.card}
            style={{ '--algo': style.color } as CSSProperties}
          >
            <input
              className={styles.box}
              type="checkbox"
              name="algorithms"
              value={id}
              checked={value.includes(id)}
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
      })}
    </fieldset>
  );
}
