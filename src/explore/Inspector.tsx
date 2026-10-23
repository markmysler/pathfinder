import type { CSSProperties } from 'react';
import { algorithms } from '../algorithms';
import { roadsExploredBy } from '../playback/timeline';
import { ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { formatCost, formatCount, formatDistance } from '../ui/format';
import type { JobResult } from '../worker/job';
import styles from './Inspector.module.css';
import { describeStep, searchStatus } from './narration';

interface Props {
  result: JobResult;
  /** The current whole step of playback. */
  step: number;
}

const STATUS_LABEL = { searching: 'Searching', found: 'Found route', 'no-route': 'No route' };

const algoColor = (result: JobResult) =>
  ({ '--algo': ALGORITHM_STYLE[result.algorithm].color }) as CSSProperties;

/** The algorithm's badge, name and status, shown over the map. */
export function RunCard({ result, step, compact = false }: Props & { compact?: boolean }) {
  const { timeline, objective } = result;
  const { name } = algorithms[result.algorithm];
  return (
    <div className={styles.card} style={algoColor(result)}>
      <div className={styles.cardHeader}>
        <span className={styles.badge} aria-hidden="true">
          {ALGORITHM_STYLE[result.algorithm].badge}
        </span>
        <h2>{name}</h2>
        <span className={styles.status}>
          <span className={styles.dot} aria-hidden="true" />
          {STATUS_LABEL[searchStatus(timeline, step)]}
        </span>
      </div>
      {compact && (
        <dl className={styles.mini}>
          <div>
            <dt>Expanded</dt>
            <dd>{formatCount(step)}</dd>
          </div>
          <div>
            <dt>Frontier</dt>
            <dd>{formatCount(timeline.frontierSizeAt[step]!)}</dd>
          </div>
          <div>
            <dt>Cost so far</dt>
            <dd>{formatCost(timeline.expandedCost[step]!, objective)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** Live numbers and a plain-language account of the current step. */
export function Inspector({ result, step }: Props) {
  const { timeline, objective } = result;
  const { name, informed } = algorithms[result.algorithm];
  const route = timeline.route;
  const found = route && step >= timeline.steps;

  return (
    <div className={styles.inspector} style={algoColor(result)}>
      <header>
        <p className={styles.eyebrow}>Inspector</p>
        <h2 className={styles.title}>What {name} is doing right now</h2>
      </header>

      <dl className={styles.tiles}>
        <div className={styles.tile}>
          <dt>Expanded</dt>
          <dd>{formatCount(step)}</dd>
        </div>
        <div className={styles.tile}>
          <dt>In frontier</dt>
          <dd>{formatCount(timeline.frontierSizeAt[step]!)}</dd>
        </div>
        <div className={styles.tile}>
          <dt>Cost so far · g</dt>
          <dd>{formatCost(timeline.expandedCost[step]!, objective)}</dd>
        </div>
        {informed ? (
          <div className={styles.tile}>
            <dt>Estimate left · h</dt>
            <dd>{formatCost(timeline.expandedEstimate[step]!, objective)}</dd>
          </div>
        ) : (
          <div className={styles.tile}>
            <dt>Roads explored</dt>
            <dd>{formatCount(roadsExploredBy(timeline, step))}</dd>
          </div>
        )}
      </dl>

      <section className={styles.step} aria-labelledby="inspector-step">
        <h3 id="inspector-step">Step {formatCount(step)}</h3>
        <p>{describeStep(timeline, step, result.algorithm, objective)}</p>
      </section>

      {found && (
        <section className={styles.route} aria-label="Route">
          <p>
            {objective === 'fastest'
              ? `Found a route taking ${formatCost(route.cost, objective)} (${formatDistance(route.meters)})`
              : `Found a route of ${formatCost(route.cost, objective)}`}{' '}
            in {formatCount(timeline.steps)} steps.
          </p>
        </section>
      )}

      <section aria-labelledby="inspector-legend">
        <h3 id="inspector-legend" className={styles.eyebrow}>
          On the map
        </h3>
        <ul className={styles.legend}>
          <li>
            <svg width="28" height="12" aria-hidden="true">
              <path d="M1 6h26" stroke="var(--algo)" strokeWidth="3" strokeOpacity="0.8" />
            </svg>
            Explored roads
          </li>
          <li>
            <svg width="28" height="12" aria-hidden="true">
              <circle cx="14" cy="6" r="3.5" fill="var(--algo)" />
            </svg>
            Frontier: reached, not yet expanded
          </li>
          <li>
            <svg width="28" height="16" aria-hidden="true">
              <circle cx="14" cy="8" r="6.5" fill="none" stroke="var(--algo)" strokeOpacity="0.6" />
              <circle cx="14" cy="8" r="3" fill="#fff" stroke="var(--algo)" strokeWidth="1.5" />
            </svg>
            Node being expanded
          </li>
          <li>
            <svg width="28" height="12" aria-hidden="true">
              <path d="M2 6h24" stroke="#090c10" strokeWidth="7" strokeLinecap="round" />
              <path d="M2 6h24" stroke="var(--algo)" strokeWidth="4" strokeLinecap="round" />
            </svg>
            Route, once found
          </li>
        </ul>
      </section>
    </div>
  );
}
