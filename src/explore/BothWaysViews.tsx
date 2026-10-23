import { useMemo, useState, type CSSProperties } from 'react';
import { algorithms, oneWayOf } from '../algorithms';
import { labelOf, type NodeLabels } from '../osm/places';
import { frontierAt } from '../playback/frontier';
import { meetingSplit, sideNext, stopCheck } from '../playback/sides';
import { meetingAt, type Timeline } from '../playback/timeline';
import { sideColors } from '../ui/algorithmStyle';
import { formatCost, formatCount } from '../ui/format';
import type { RunView } from './Inspector';
import styles from './BothWays.module.css';
import {
  apart,
  describeStep,
  describeStepRoads,
  describeStopCheck,
  describeTurn,
} from './narration';

interface Props {
  run: RunView;
  step: number;
}

/** A side's letter: 0 is the side from A, 1 the side from B. */
const sideName = (side: number) => (side ? 'B' : 'A');
/** Rows per side on desktop, where both lists show at once; phones show one side at a time. */
const ROWS = { both: 5, one: 8 };

/** A side's marker: filled for A, a ring for B, like the A and B pins and the frontier dots. */
export function SideDot({ side }: { side: number }) {
  return <span className={styles.sideDot} data-side={sideName(side)} aria-hidden="true" />;
}

/** The colours of both sides, for styles that draw them. */
function sideStyle(run: RunView) {
  const [a, b] = sideColors(run.algorithm);
  return { '--side-a': a, '--side-b': b } as CSSProperties;
}

/** How many of the first `step` steps each side took. */
function useStepsBySide(t: Timeline) {
  const fromB = useMemo(() => {
    const counts = new Uint32Array(t.steps + 1);
    for (let s = 1; s <= t.steps; s++) counts[s] = counts[s - 1]! + t.expandedSide[s]!;
    return counts;
  }, [t]);
  return (step: number) => [step - fromB[step]!, fromB[step]!] as const;
}

export function BothWaysTiles({ run, step }: Props) {
  const { timeline: t, objective } = run;
  const [fromA, fromB] = useStepsBySide(t)(step);
  const onB = t.frontierSizeAtB[step]!;
  const meeting = meetingAt(t, step);
  const side = sideName(t.expandedSide[step]!);
  return (
    <dl className={styles.tiles} style={sideStyle(run)}>
      <div className={styles.tile}>
        <dt>Expanded</dt>
        <dd>{formatCount(step)}</dd>
        <dd className={styles.sub}>
          <span className={styles.mono}>{formatCount(fromA)}</span> from A ·{' '}
          <span className={styles.mono}>{formatCount(fromB)}</span> from B
        </dd>
      </div>
      <div className={styles.tile}>
        <dt>In frontiers</dt>
        <dd>{formatCount(t.frontierSizeAt[step]!)}</dd>
        <dd className={styles.sub}>
          <span className={styles.mono}>{formatCount(t.frontierSizeAt[step]! - onB)}</span> A ·{' '}
          <span className={styles.mono}>{formatCount(onB)}</span> B
        </dd>
      </div>
      <div className={styles.tile}>
        <dt>{step > 0 ? `This step · from ${side}` : 'This step'}</dt>
        <dd>{step > 0 ? formatCost(t.expandedCost[step]!, objective) : '—'}</dd>
        <dd className={styles.sub}>{side === 'A' ? 'cost from A · g' : 'cost to B · g'}</dd>
      </div>
      <div className={styles.tile}>
        <dt>Best route so far</dt>
        <dd>{meeting < 0 ? '—' : formatCost(t.meetCost[meeting]!, objective)}</dd>
        <dd className={styles.sub}>
          {meeting < 0 ? 'once the sides meet' : 'through the meeting point'}
        </dd>
      </div>
    </dl>
  );
}

export function BothWaysNow({ run, step, names }: Props & { names: NodeLabels }) {
  const { timeline: t, objective, algorithm } = run;
  const side = t.expandedSide[step]!;
  const playing = step > 0 && step < t.steps;
  const heading = step > 0 ? `Step ${formatCount(step)} · from ${sideName(side)}` : 'Start';
  const account = playing
    ? `${describeTurn(t, step, algorithm, objective, names)} ${describeStepRoads(t, step, algorithm)}`
    : describeStep(t, step, algorithm, objective);
  return (
    <div className={styles.now} style={sideStyle(run)}>
      <section className={styles.step} aria-label={heading}>
        <h3>
          {step > 0 && <SideDot side={side} />}
          {heading}
        </h3>
        <p>{account}</p>
      </section>
      <StopCard run={run} step={step} />
      <BestMeeting run={run} step={step} names={names} />
      <BothWaysLegend />
    </div>
  );
}

/** "Can it stop yet?": the two next priorities added up, against the best route found. */
function StopCard({ run, step }: Props) {
  const { timeline: t, objective, algorithm } = run;
  const check = stopCheck(t, step);
  const bfs = oneWayOf(algorithm) === 'bfs';
  const met = Number.isFinite(check.best);
  const [a, b] = check.next;
  const shown = apart([a, b, a + b, check.best], algorithm, objective);
  const share = (v: number) => `${Math.min(100, (100 * v) / Math.max(check.best, a + b, 1e-9))}%`;
  return (
    <section className={styles.stop} aria-labelledby="stop-check">
      <h3 id="stop-check">Can it stop yet?</h3>
      {met && Number.isFinite(a + b) && (
        <div className={styles.meter}>
          <div className={styles.bar} aria-hidden="true">
            <span data-side="A" style={{ width: share(a) }} />
            <span data-side="B" style={{ width: share(b) }} />
          </div>
          <p className={styles.meterLabel}>
            <span>
              {algorithms[algorithm].informed ? 'Next priorities' : 'Next from A + next from B'}
            </span>
            <span>
              <span className={styles.mono}>
                {shown[0]} + {shown[1]} = {shown[2]}
              </span>{' '}
              of <span className={styles.mono}>{shown[3]}</span>
              {bfs && ' roads'}
            </span>
          </p>
        </div>
      )}
      <p>{describeStopCheck(check, algorithm, objective)}</p>
    </section>
  );
}

function BestMeeting({ run, step, names }: Props & { names: NodeLabels }) {
  const { timeline: t, objective } = run;
  const meeting = meetingAt(t, step);
  if (meeting < 0) return null;
  const { fromA, toB } = meetingSplit(t, meeting);
  const cost = (v: number) => formatCost(v, objective);
  const first = meeting === 0 && step < t.steps;
  return (
    <section className={styles.meeting} aria-labelledby="best-meeting">
      <span className={styles.diamond} aria-hidden="true" />
      <p>
        <span id="best-meeting">Best meeting so far</span>:{' '}
        <b>{labelOf(names, t.meetNode[meeting]!)}</b>, {cost(fromA)} from A + {cost(toB)} to B ={' '}
        {cost(fromA + toB)}, found at step {formatCount(t.meetStep[meeting]!)}.
        {first && ' The first time the sides touch is often not on the best route.'}
      </p>
    </section>
  );
}

function BothWaysLegend() {
  return (
    <section aria-labelledby="both-legend">
      <h3 id="both-legend" className={styles.eyebrow}>
        On the map
      </h3>
      <ul className={styles.legend}>
        <li>
          <svg width="28" height="12" aria-hidden="true">
            <path d="M1 6h12" stroke="var(--side-a)" strokeWidth="3" />
            <path d="M15 6h12" stroke="var(--side-b)" strokeWidth="3" />
          </svg>
          Roads explored from A, and from B
        </li>
        <li>
          <svg width="28" height="12" aria-hidden="true">
            <circle cx="8" cy="6" r="3.5" fill="var(--side-a)" />
            <circle cx="20" cy="6" r="3.5" fill="none" stroke="var(--side-b)" strokeWidth="1.5" />
          </svg>
          Frontiers: from A filled, from B rings
        </li>
        <li>
          <svg width="28" height="14" aria-hidden="true">
            <path d="M14 1l6 6-6 6-6-6z" fill="#fff" stroke="#090c10" strokeWidth="1.5" />
          </svg>
          Best meeting point so far
        </li>
        <li>
          <svg width="28" height="12" aria-hidden="true">
            <path d="M2 6h24" stroke="#090c10" strokeWidth="7" strokeLinecap="round" />
            <path d="M2 6h12" stroke="var(--side-a)" strokeWidth="4" strokeLinecap="round" />
            <path d="M14 6h12" stroke="var(--side-b)" strokeWidth="4" strokeLinecap="round" />
          </svg>
          Route, once sure: each half in its side&rsquo;s colour
        </li>
      </ul>
    </section>
  );
}

/** Both frontiers: stacked on desktop, one at a time on phones. */
export function BothFrontiersView({
  run,
  step,
  names,
  compact,
  onHighlight,
}: Props & {
  names: NodeLabels;
  compact: boolean;
  onHighlight?(position: [number, number] | null): void;
}) {
  const { timeline: t, objective, algorithm } = run;
  const [shown, setShown] = useState(0);
  const next = sideNext(t, step);
  const priority = (side: number) => (next[side]! < 0 ? Infinity : t.entryPriority[next[side]!]!);
  // The side that takes the next step: the lower next priority, A on a tie.
  const going = step < t.steps ? (priority(1) < priority(0) ? 1 : 0) : -1;
  const lists = [0, 1].map((side) => frontierAt(t, step, compact ? ROWS.one : ROWS.both, side));
  const bfs = oneWayOf(algorithm) === 'bfs';
  const cost = (v: number) => formatCost(v, objective);
  const value = (v: number) => (bfs ? `${v} ${v === 1 ? 'road' : 'roads'}` : cost(v));
  const unit = (side: number) =>
    algorithms[algorithm].informed
      ? 'priority'
      : side
        ? bfs
          ? 'roads to B'
          : 'cost to B'
        : bfs
          ? 'roads from A'
          : 'cost from A';

  const rows = (side: number) => (
    <ol className={styles.rows}>
      {lists[side]!.entries.map((entry, i) => {
        const node = t.entryNode[entry]!;
        const point = () => onHighlight?.(positionOf(t, node, side));
        const clear = () => onHighlight?.(null);
        const isNext = i === 0 && side === going;
        return (
          <li key={entry}>
            <button
              type="button"
              className={styles.row}
              data-next={isNext}
              onMouseEnter={point}
              onMouseLeave={clear}
              onFocus={point}
              onBlur={clear}
              onClick={point}
            >
              <span className={styles.rank} aria-hidden="true">
                {i + 1}
              </span>
              <span className={styles.name}>
                <span className={styles.label}>{labelOf(names, node)}</span>
                {isNext && (
                  <span className={styles.next} data-side={sideName(side)}>
                    next
                  </span>
                )}
              </span>
              <span className={styles.key}>{value(t.entryPriority[entry]!)}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );

  const more = (side: number) => {
    const n = Math.max(0, lists[side]!.waiting - lists[side]!.entries.length);
    return n > 0 ? (
      <p className={styles.more}>
        …and {formatCount(n)} more{compact ? ` from ${sideName(side)}` : ''}.
      </p>
    ) : null;
  };

  const [pa, pb] = apart([priority(0), priority(1)], algorithm, objective);
  const said = (side: number) => (bfs ? value(priority(side)) : side ? pb : pa);
  const verdict =
    going < 0
      ? null
      : priority(1 - going) === Infinity
        ? `${sideName(going)} goes next: ${sideName(1 - going)}'s frontier is empty.`
        : priority(0) === priority(1)
          ? `A goes next: both next ${bfs ? 'nodes are' : 'priorities are'} ${said(0)}, and A goes first on a tie.`
          : `${sideName(going)} goes next: ${said(going)} beats ${sideName(1 - going)}'s ${said(1 - going)}.`;

  if (compact) {
    return (
      <div className={styles.frontiers} style={sideStyle(run)}>
        <div role="radiogroup" aria-label="Which side" className={styles.switch}>
          {[0, 1].map((side) => (
            <button
              key={side}
              type="button"
              role="radio"
              aria-checked={shown === side}
              onClick={() => setShown(side)}
            >
              <SideDot side={side} />
              From {sideName(side)} ·{' '}
              <span className={styles.mono}>{formatCount(lists[side]!.waiting)}</span>
            </button>
          ))}
        </div>
        <p className={styles.intro}>
          {capitalise(unit(shown))}, lowest first. {verdict} Tap one to find it on the map.
        </p>
        {rows(shown)}
        {more(shown)}
      </div>
    );
  }

  return (
    <div className={styles.frontiers} style={sideStyle(run)}>
      <p className={styles.intro}>
        Each side keeps its own frontier, lowest{' '}
        {algorithms[algorithm].informed ? 'priority' : bfs ? 'roads' : 'cost'} first. The side whose
        next node comes first takes the next step. Hover over one to find it on the map.
      </p>
      {[0, 1].map((side) => (
        <section
          key={side}
          className={styles.side}
          aria-label={`From ${sideName(side)} · ${lists[side]!.waiting} waiting`}
        >
          <h3>
            <SideDot side={side} />
            From {sideName(side)}{' '}
            <span className={styles.count}>
              · <span className={styles.mono}>{formatCount(lists[side]!.waiting)}</span> waiting
            </span>
            <span className={styles.unit}>{unit(side)}</span>
          </h3>
          {rows(side)}
          {more(side)}
        </section>
      ))}
      {verdict && <p className={styles.verdict}>{verdict}</p>}
      {lists[0]!.outdated + lists[1]!.outdated > 0 && (
        <p className={styles.more}>
          {formatCount(lists[0]!.outdated + lists[1]!.outdated)} outdated entries are not listed.
        </p>
      )}
    </div>
  );
}

const capitalise = (text: string) => text[0]!.toUpperCase() + text.slice(1);

/** Where a node waiting on a side is drawn: the frontier positions are kept per side. */
function positionOf(t: Timeline, node: number, side: number): [number, number] {
  for (let i = 0; i < t.frontierCount; i++) {
    if (t.frontierNode[i] === node && t.frontierSide[i] === side) {
      return [t.frontierPosition[2 * i]!, t.frontierPosition[2 * i + 1]!];
    }
  }
  return [0, 0];
}

/** The stop rule in one line, for the phone's collapsed sheet. */
export function StopMeterLine({ run, step }: Props) {
  const { timeline: t, objective, algorithm } = run;
  const check = stopCheck(t, step);
  if (!Number.isFinite(check.best) || step >= t.steps) return null;
  const bfs = oneWayOf(algorithm) === 'bfs';
  const [a, b] = check.next;
  const shown = apart([a, b, a + b, check.best], algorithm, objective);
  const share = (v: number) => `${Math.min(100, (100 * v) / Math.max(check.best, a + b, 1e-9))}%`;
  return (
    <span className={styles.meterLine} style={sideStyle(run)}>
      <span className={styles.bar} aria-hidden="true">
        <span data-side="A" style={{ width: share(a) }} />
        <span data-side="B" style={{ width: share(b) }} />
      </span>
      <span className={styles.meterLabel}>
        <span>
          Can stop at <span className={styles.mono}>{shown[3]}</span>
          {bfs && ' roads'} · now{' '}
          <span className={styles.mono}>
            {shown[0]} + {shown[1]} = {shown[2]}
          </span>
        </span>
      </span>
    </span>
  );
}

/** What the two colours and the diamond mean, over a bidirectional search's map. */
export function MapKey({ run }: { run: RunView }) {
  return (
    <ul aria-label="Map key" className={styles.mapKey} style={sideStyle(run)}>
      <li>
        <SideDot side={0} />
        From A
      </li>
      <li>
        <SideDot side={1} />
        From B
      </li>
      <li>
        <span className={styles.keyDiamond} aria-hidden="true" />
        Best meeting point
      </li>
    </ul>
  );
}
