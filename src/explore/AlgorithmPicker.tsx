import { AlgorithmBadge } from '../ui/AlgorithmBadge';
import { algorithms, type AlgorithmId } from '../algorithms';
import { algoColor, ALGORITHM_STYLE, formatWeight } from '../ui/algorithmStyle';
import { BothWaysIcon, CheckIcon } from '../ui/icons';
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
  const bothWays = 'Bidirectional A* always uses 1×.';
  if (weight === 1) {
    return `At 1×, A* is guaranteed the best route. Raise it to trade route quality for speed. ${bothWays}`;
  }
  const worse = Math.round((weight - 1) * 100);
  return `At ${formatWeight(weight)}, A* trusts its estimate more than the roads. It expands fewer nodes, but its route can be up to ${worse}% worse than the best. ${bothWays}`;
}

const ALL = Object.keys(algorithms) as AlgorithmId[];
const ONE_WAY = ALL.filter((id) => !algorithms[id].bidirectional);
const BOTH_WAYS = ALL.filter((id) => algorithms[id].bidirectional);

/** Choose one algorithm to study, or several to compare side by side. */
export function AlgorithmPicker({
  value,
  onToggle,
  limit = MAX_ALGORITHMS,
  weight = 1,
  onWeight,
}: Props) {
  const full = value.length >= limit;
  const item = (id: AlgorithmId) => {
    const { name } = algorithms[id];
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
        <AlgorithmBadge algorithm={id} className={styles.badge} />
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
    const color = algoColor(id);
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
  };

  return (
    <fieldset className={styles.group}>
      <legend className={styles.legend}>
        <span>Algorithms</span>
        <span className={styles.count}>
          {value.length} selected · up to {limit}
        </span>
      </legend>
      {ONE_WAY.map(item)}
      <div role="group" aria-labelledby="algorithms-both-ways" className={styles.both}>
        <div className={styles.bothHeader}>
          <h3 id="algorithms-both-ways" className={styles.bothTitle}>
            <BothWaysIcon size={15} />
            From both ends
          </h3>
          <p className={styles.bothIntro}>
            Search forward from A and backward from B at once. Same route as the one-way search,
            usually with less exploring.
          </p>
        </div>
        {BOTH_WAYS.map(item)}
      </div>
      {full && <p className={styles.limit}>Up to {limit} at once. Untick one to pick another.</p>}
    </fieldset>
  );
}
