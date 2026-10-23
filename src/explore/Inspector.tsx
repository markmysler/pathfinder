import { useId, useState } from 'react';
import { algorithms } from '../algorithms';
import type { NodeLabels } from '../osm/places';
import { roadsExploredBy } from '../playback/timeline';
import { algoColor, algorithmName, ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { formatCost, formatCount, formatDistance } from '../ui/format';
import type { Objective } from '../osm/network';
import type { AlgorithmRun } from '../worker/job';
import styles from './Inspector.module.css';
import { CodeView, FrontierView } from './InspectorViews';
import { describeStep, searchStatus } from './narration';

/** One algorithm's search and what its costs measure. */
export type RunView = AlgorithmRun & { objective: Objective };

interface Props {
  run: RunView;
  /** The current whole step of playback. */
  step: number;
}

interface InspectorProps {
  /** Street names, for the frontier and the line-by-line account. */
  names: NodeLabels;
  /** While playing, the pseudocode keeps to the line that takes each node. */
  playing: boolean;
  /** Phones: shorter labels. */
  compact?: boolean;
  /** Rings a node on the map, or clears the ring with null. */
  onHighlight?(position: [number, number] | null): void;
}

type View = 'now' | 'frontier' | 'code';

const STATUS_LABEL = { searching: 'Searching', found: 'Found route', 'no-route': 'No route' };

/** The algorithm's badge, name and status, shown over the map. */
export function RunCard({ run, step, compact = false }: Props & { compact?: boolean }) {
  const { timeline, objective } = run;
  const name = algorithmName(run.algorithm, run.weight);
  return (
    <div className={styles.card} style={algoColor(run.algorithm)}>
      <div className={styles.cardHeader}>
        <span className={styles.badge} aria-hidden="true">
          {ALGORITHM_STYLE[run.algorithm].badge}
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

/** Live numbers, and three ways to look at the current step: in words, the frontier, the code. */
export function Inspector({
  run,
  step,
  names,
  playing,
  compact = false,
  onHighlight,
}: Props & InspectorProps) {
  const { timeline, objective } = run;
  const { name, informed } = algorithms[run.algorithm];
  const [view, setView] = useState<View>('now');
  const views: { id: View; label: string }[] = [
    { id: 'now', label: 'Now' },
    { id: 'frontier', label: 'Frontier' },
    { id: 'code', label: compact ? 'Code' : 'Pseudocode' },
  ];
  const label = views.find((v) => v.id === view)!.label;
  const id = useId();

  return (
    <div className={styles.inspector} style={algoColor(run.algorithm)}>
      {!compact && (
        <>
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
        </>
      )}

      <div role="tablist" aria-label="Inspector views" className={styles.tabs}>
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            id={`${id}-${v.id}`}
            aria-selected={view === v.id}
            aria-controls={`${id}-panel`}
            className={styles.tab}
            onClick={() => setView(v.id)}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`${id}-panel`} aria-label={label} className={styles.panel}>
        {view === 'frontier' && (
          <FrontierView
            run={run}
            step={step}
            names={names}
            compact={compact}
            onHighlight={onHighlight}
          />
        )}
        {view === 'code' && (
          <CodeView key={step} run={run} step={step} names={names} playing={playing} />
        )}
        {view === 'now' && <NowView run={run} step={step} />}
      </div>
    </div>
  );
}

function NowView({ run, step }: Props) {
  const { timeline, objective } = run;
  const route = timeline.route;
  const found = route && step >= timeline.steps;
  return (
    <>
      <section className={styles.step} aria-labelledby="inspector-step">
        <h3 id="inspector-step">Step {formatCount(step)}</h3>
        <p>{describeStep(timeline, step, run.algorithm, objective, run.weight)}</p>
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
    </>
  );
}
