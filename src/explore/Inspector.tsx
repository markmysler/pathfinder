import { useId, useState, type ReactNode } from 'react';
import { learnHref } from '../app/routes';
import { AlgorithmBadge } from '../ui/AlgorithmBadge';
import { algorithms } from '../algorithms';
import { labelOf, type NodeLabels } from '../osm/places';
import { meetingAt, roadsExploredBy } from '../playback/timeline';
import { algoColor, algorithmName, ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { formatCost, formatCount, formatDistance } from '../ui/format';
import type { Objective } from '../osm/network';
import type { AlgorithmRun, PreparationView, TrafficOutcome } from '../worker/job';
import {
  AltNow,
  AltTiles,
  ClimbNow,
  ClimbTiles,
  RoundNow,
  RoundTiles,
  StepLimitNotice,
} from './AdvancedViews';
import { roundTitle, useRounds } from './advancedRun';
import styles from './Inspector.module.css';
import { BothFrontiersView, BothWaysNow, BothWaysTiles } from './BothWaysViews';
import { CodeView, FrontierView } from './InspectorViews';
import { describeStep, searchStatus } from './narration';
import { TrafficCoverage, TrafficStoryCard } from './TrafficViews';

/**
 * One algorithm's search, what its costs measure, and the traffic it ran with. The advanced
 * algorithms also need what was prepared, and the node B snapped to.
 */
export type RunView = AlgorithmRun & {
  objective: Objective;
  traffic?: TrafficOutcome;
  preparation?: PreparationView;
  target?: number;
};

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
  /** Plays a search stopped at the step limit from its start. */
  onWatch?(): void;
}

type View = 'now' | 'frontier' | 'code';

const STATUS_LABEL = {
  searching: 'Searching',
  found: 'Found route',
  'no-route': 'No route',
  stopped: 'Stopped · too long',
};

/** The algorithm's badge, name and status, shown over the map. */
export function RunCard({
  run,
  step,
  compact = false,
  children,
  status: statusText,
  prepareStep,
}: Props & {
  compact?: boolean;
  /** Prepare and Search tabs, for algorithms that prepare first. */
  children?: ReactNode;
  /** Says what is shown instead of how the search stands, such as "Preparing". */
  status?: string;
  /** Watching contraction: how far it has got, for the numbers under a phone's card. */
  prepareStep?: number;
}) {
  const { timeline, objective } = run;
  const rounds = useRounds(run);
  const status = searchStatus(timeline, step);
  const replay = run.preparation?.hierarchy?.replay;
  // Phones have no room for "Bidirectional"; its badge's arrows say it.
  const { bidirectional, advanced } = algorithms[run.algorithm];
  const name =
    compact && (bidirectional || (advanced && run.algorithm !== 'bellmanford'))
      ? ALGORITHM_STYLE[run.algorithm].short
      : algorithmName(run.algorithm, run.weight);
  return (
    <div className={styles.card} style={algoColor(run.algorithm)}>
      <div className={styles.cardHeader}>
        <AlgorithmBadge algorithm={run.algorithm} className={styles.badge} />
        <h2>{name}</h2>
        {!compact && children}
        <span className={styles.status}>
          <span className={styles.dot} aria-hidden="true" />
          {statusText ??
            (rounds && status === 'searching'
              ? `Round ${rounds.roundAt[step]}`
              : STATUS_LABEL[status])}
        </span>
      </div>
      {compact && children}
      {compact && replay && prepareStep !== undefined && (
        <dl className={styles.mini}>
          <div>
            <dt>Contracted</dt>
            <dd>{Math.round((100 * prepareStep) / replay.steps)}%</dd>
          </div>
          <div>
            <dt>Shortcuts so far</dt>
            <dd>{formatCount(replay.shortcutsBy[prepareStep]!)}</dd>
          </div>
        </dl>
      )}
      {compact && prepareStep === undefined && rounds && (
        <dl className={styles.mini}>
          <div>
            <dt>Expanded</dt>
            <dd>{formatCount(step)}</dd>
          </div>
          <div>
            <dt>Corrections</dt>
            <dd>{formatCount(step - rounds.distinctBy[step]!)}</dd>
          </div>
          <div>
            <dt>Best to B</dt>
            <dd>
              {Number.isFinite(rounds.targetCostAt[step]!)
                ? formatCost(rounds.targetCostAt[step]!, objective)
                : '—'}
            </dd>
          </div>
        </dl>
      )}
      {compact && prepareStep === undefined && run.algorithm === 'alt' && (
        <dl className={styles.mini}>
          <div>
            <dt>Expanded</dt>
            <dd>{formatCount(step)}</dd>
          </div>
          <div>
            <dt>So far</dt>
            <dd>{formatCost(timeline.expandedCost[step]!, objective)}</dd>
          </div>
          <div>
            <dt>Estimate</dt>
            <dd>{formatCost(timeline.expandedEstimate[step]!, objective)}</dd>
          </div>
        </dl>
      )}
      {compact && prepareStep === undefined && !rounds && run.algorithm !== 'alt' && (
        <dl className={styles.mini}>
          <div>
            <dt>Expanded</dt>
            <dd>{formatCount(step)}</dd>
          </div>
          <div>
            <dt>Frontier</dt>
            <dd>{formatCount(timeline.frontierSizeAt[step]!)}</dd>
          </div>
          {algorithms[run.algorithm].bidirectional ? (
            <div>
              <dt>Best route</dt>
              <dd>{bestRoute(run, step)}</dd>
            </div>
          ) : (
            <div>
              <dt>Cost so far</dt>
              <dd>{formatCost(timeline.expandedCost[step]!, objective)}</dd>
            </div>
          )}
        </dl>
      )}
    </div>
  );
}

/** The best route a bidirectional search has found by a step, or a dash before its sides meet. */
function bestRoute({ timeline, objective }: RunView, step: number) {
  const meeting = meetingAt(timeline, step);
  return meeting < 0 ? '—' : formatCost(timeline.meetCost[meeting]!, objective);
}

/** Live numbers, and three ways to look at the current step: in words, the frontier, the code. */
export function Inspector({
  run,
  step,
  names,
  playing,
  compact = false,
  onHighlight,
  onWatch,
}: Props & InspectorProps) {
  const { timeline, objective } = run;
  const { name, informed, bidirectional } = algorithms[run.algorithm];
  const rounds = useRounds(run);
  const ch = run.algorithm === 'ch';
  const alt = run.algorithm === 'alt';
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
            <h2 className={styles.title}>
              {rounds
                ? roundTitle(timeline, rounds, step)
                : (alt || ch) && step >= timeline.steps
                  ? `${name} ${timeline.route ? `found the ${objective} route` : 'found no route'}`
                  : alt && step > 0
                    ? `ALT is expanding ${labelOf(names, timeline.expandedNode[step]!)}`
                    : ch && step > 0
                      ? `Contraction hierarchies is climbing from ${timeline.expandedSide[step] ? 'B' : 'A'}`
                      : `What ${name} is doing right now`}
            </h2>
          </header>
          {run.limit && <StepLimitNotice limit={run.limit} name={name} onWatch={onWatch} />}
          {rounds ? (
            <RoundTiles run={run} step={step} rounds={rounds} />
          ) : alt ? (
            <AltTiles run={run} step={step} />
          ) : ch ? (
            <ClimbTiles run={run} step={step} hierarchy={run.preparation?.hierarchy} />
          ) : bidirectional ? (
            <BothWaysTiles run={run} step={step} />
          ) : (
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
          )}
        </>
      )}

      {compact && run.limit && <StepLimitNotice limit={run.limit} name={name} onWatch={onWatch} />}

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
        {view === 'frontier' && bidirectional && (
          <BothFrontiersView
            run={run}
            step={step}
            names={names}
            compact={compact}
            onHighlight={onHighlight}
          />
        )}
        {view === 'frontier' && !bidirectional && (
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
        {view === 'now' &&
          (rounds ? (
            <RoundNow run={run} step={step} names={names} rounds={rounds} />
          ) : alt ? (
            <AltNow run={run} step={step} landmarks={run.preparation?.landmarks} />
          ) : ch ? (
            <ClimbNow run={run} step={step} names={names} hierarchy={run.preparation?.hierarchy} />
          ) : bidirectional ? (
            <BothWaysNow run={run} step={step} names={names} />
          ) : (
            <NowView run={run} step={step} />
          ))}
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

      {found && run.traffic?.status === 'live' && (
        <>
          <TrafficStoryCard outcome={run.traffic} objective={objective} />
          <TrafficCoverage outcome={run.traffic} />
          {exactWithTraffic(run) && (
            <p className={styles.note}>
              A* still finds the best route with traffic: traffic only ever slows a road, so its
              straight-line estimate at the top speed still never overestimates.{' '}
              <a href={learnHref('roads')}>Why traffic changes routes</a>
            </p>
          )}
        </>
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

/** A* that is still guaranteed the best route: plain, not weighted. */
const exactWithTraffic = (run: RunView) =>
  (run.algorithm === 'astar' && run.weight === 1) || run.algorithm === 'biastar';
