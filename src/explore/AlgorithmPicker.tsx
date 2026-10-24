import { useId, useState } from 'react';
import { AlgorithmBadge } from '../ui/AlgorithmBadge';
import { algorithms, type AlgorithmId, type AlgorithmInfo } from '../algorithms';
import { algoColor, ALGORITHM_STYLE, formatWeight } from '../ui/algorithmStyle';
import { BothWaysIcon, CheckIcon, ChevronDownIcon, LevelsIcon, TimerIcon } from '../ui/icons';
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
const info = (id: AlgorithmId): AlgorithmInfo => algorithms[id];
const ONE_WAY = ALL.filter((id) => !info(id).bidirectional && !info(id).advanced);
const BOTH_WAYS = ALL.filter((id) => info(id).bidirectional && !info(id).advanced);
const ADVANCED = ALL.filter((id) => info(id).advanced);

/** "none selected", or "2 of 3 selected". */
const chosenOf = (group: readonly AlgorithmId[], value: readonly AlgorithmId[]) => {
  const chosen = group.filter((id) => value.includes(id)).length;
  return chosen ? `${chosen} of ${group.length} selected` : 'none selected';
};

/** Choose one algorithm to study, or several to compare side by side. */
export function AlgorithmPicker({
  value,
  onToggle,
  limit = MAX_ALGORITHMS,
  weight = 1,
  onWeight,
}: Props) {
  const full = value.length >= limit;
  const [bothOpen, setBothOpen] = useState(() => BOTH_WAYS.some((id) => value.includes(id)));
  const bothId = useId();
  const preparing = value.some((id) => info(id).prepares);
  const item = (id: AlgorithmId) => {
    const { name, prepares } = info(id);
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
          {prepares && (
            <span className={styles.prepares}>
              <TimerIcon size={12} strokeWidth={2.2} />
              Prepares first
            </span>
          )}
        </span>
        {prepares && <TimerIcon className={styles.preparesIcon} size={13} strokeWidth={2.2} />}
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
      <div className={styles.both}>
        <button
          type="button"
          className={styles.fold}
          aria-expanded={bothOpen}
          aria-controls={bothId}
          onClick={() => setBothOpen((open) => !open)}
        >
          <BothWaysIcon size={16} />
          <span className={styles.foldTitle}>From both ends</span>
          <span className={styles.groupCount}>
            {BOTH_WAYS.length} searches · {chosenOf(BOTH_WAYS, value)}
          </span>
          <ChevronDownIcon size={16} className={styles.chevron} />
        </button>
        {bothOpen && (
          <div
            id={bothId}
            role="group"
            aria-labelledby="algorithms-both-ways"
            className={styles.items}
          >
            <p id="algorithms-both-ways" className={styles.bothIntro}>
              <span className={styles.visuallyHidden}>From both ends</span>
              <span aria-hidden="true">
                Search forward from A and backward from B at once. Same route as the one-way search,
                usually with less exploring.
              </span>
            </p>
            {BOTH_WAYS.map(item)}
          </div>
        )}
      </div>
      <div role="group" aria-labelledby="algorithms-advanced" className={styles.both}>
        <div className={styles.bothHeader}>
          <h3 id="algorithms-advanced" className={styles.bothTitle}>
            <LevelsIcon size={16} />
            <span className={styles.foldTitle}>Advanced</span>
            <span className={styles.groupCount}>{chosenOf(ADVANCED, value)}</span>
          </h3>
          <p className={styles.bothIntro}>
            Built for other jobs: roads that cost less than nothing, or one map answering many
            routes. Two of them prepare the whole map before searching.
          </p>
        </div>
        {ADVANCED.map(item)}
      </div>
      {preparing && (
        <p className={styles.note}>
          <TimerIcon size={14} />
          ALT and CH prepare these roads once, then reuse it for every route you run here.
        </p>
      )}
      {full && <p className={styles.limit}>Up to {limit} at once. Untick one to pick another.</p>}
    </fieldset>
  );
}
