import { useMemo, useState, type ReactNode } from 'react';
import { PHONE, useMediaQuery } from '../app/hooks';
import { algoColor } from '../ui/algorithmStyle';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';
import {
  climbFigure,
  contractionSteps,
  landmarkFigure,
  NEGATIVE_LAYOUT,
  negativeExample,
} from './advanced';
import { listOf } from './diagram';
import styles from './AdvancedFigures.module.css';
import { SIX, type DiagramNetwork } from './networks';
import diagram from './StepDiagram.module.css';
import article from './Article.module.css';
import { streetLandmarks } from './streets';

const R = 16;

/** Previous and next, and where we are. */
function Stepper({
  at,
  count,
  onStep,
  children,
  extra,
}: {
  at: number;
  count: number;
  onStep(at: number): void;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className={diagram.controls}>
      <button
        type="button"
        className={diagram.stepButton}
        aria-label="Previous step"
        disabled={at === 0}
        onClick={() => onStep(at - 1)}
      >
        <ChevronLeftIcon />
      </button>
      <p className={diagram.position}>{children}</p>
      <button
        type="button"
        className={diagram.stepButton}
        aria-label="Next step"
        disabled={at === count - 1}
        onClick={() => onStep(at + 1)}
      >
        <ChevronRightIcon />
      </button>
      {extra}
    </div>
  );
}

/** A road from one point to another, stopping at the circles, with its cost beside it. */
function Road({
  from,
  to,
  label,
  arrow = false,
  state,
  bend = 0,
}: {
  from: readonly [number, number];
  to: readonly [number, number];
  label?: string;
  arrow?: boolean;
  state?: 'on' | 'dashed' | 'faint' | 'shortcut' | 'shortcutOld';
  /** Curves the road sideways by this much, so it clears what lies between. */
  bend?: number;
}) {
  const [dx, dy] = [to[0] - from[0], to[1] - from[1]];
  const length = Math.hypot(dx, dy);
  const [ux, uy] = [dx / length, dy / length];
  const gap = R + (arrow ? 5 : 0);
  const a = [from[0] + ux * R, from[1] + uy * R];
  const b = [to[0] - ux * gap, to[1] - uy * gap];
  const mid = [(from[0] + to[0]) / 2 - uy * bend, (from[1] + to[1]) / 2 + ux * bend];
  const d = bend
    ? `M${a[0]} ${a[1]}Q${2 * mid[0]! - (a[0]! + b[0]!) / 2} ${2 * mid[1]! - (a[1]! + b[1]!) / 2} ${b[0]} ${b[1]}`
    : `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
  return (
    <g className={styles.road} data-state={state}>
      <path d={d} markerEnd={arrow ? 'url(#advanced-arrow)' : undefined} />
      {label && (
        <text x={mid[0]! - uy * 16} y={mid[1]! + ux * 16 + 5} textAnchor="middle">
          {label}
        </text>
      )}
    </g>
  );
}

function Node({
  at,
  id,
  kind,
  note,
  ring,
}: {
  at: readonly [number, number];
  id: string;
  kind?: 'start' | 'goal' | 'reached' | 'gone' | 'landmark' | 'climbed';
  /** A line above the node, such as its cost. */
  note?: string;
  ring?: boolean;
}) {
  const [x, y] = at;
  return (
    <g className={styles.node} data-kind={kind}>
      {ring && <circle cx={x} cy={y} r={R + 7} className={styles.ring} />}
      {kind === 'landmark' ? (
        <path d={`M${x} ${y - R - 6}L${x + R + 6} ${y}L${x} ${y + R + 6}L${x - R - 6} ${y}Z`} />
      ) : (
        <circle cx={x} cy={y} r={R} />
      )}
      <text x={x} y={y + 5} textAnchor="middle">
        {id}
      </text>
      {note && (
        <text x={x} y={y - R - 10} textAnchor="middle" className={styles.note}>
          {note}
        </text>
      )}
    </g>
  );
}

function Arrowhead() {
  return (
    <defs>
      <marker
        id="advanced-arrow"
        viewBox="0 0 10 10"
        refX="9"
        refY="5"
        markerWidth="12"
        markerHeight="12"
        markerUnits="userSpaceOnUse"
        orient="auto-start-reverse"
      >
        <path d="M0 0L10 5L0 10z" className={styles.arrow} />
      </marker>
    </defs>
  );
}

// ---- Bellman-Ford ----------------------------------------------------------------------------

const sign = (n: number) => (n < 0 ? `−${-n}` : `${n}`);

/** Dijkstra and Bellman-Ford side by side on roads where one gives energy back. */
export function NegativeCostFigure() {
  const [loop, setLoop] = useState(false);
  const example = useMemo(() => negativeExample(loop), [loop]);
  const [chosen, setChosen] = useState(0);
  const { rounds, dijkstra, outcome, roads } = example;
  const at = Math.min(chosen, rounds.length - 1);
  const round = rounds[at]!;
  const previous = at > 0 ? rounds[at - 1]!.costs : { S: 0 };
  const ids = Object.keys(NEGATIVE_LAYOUT).filter((id) => loop || !'XYZ'.includes(id));
  // Dijkstra has taken one more node per step, until it stopped.
  const taken = dijkstra.taken.slice(0, Math.min(at + 1, dijkstra.taken.length));
  const stopped = taken.length === dijkstra.taken.length;
  const last = at === rounds.length - 1;

  const panel = (
    algorithm: 'dijkstra' | 'bellmanford',
    title: string,
    body: ReactNode,
    caption: ReactNode,
  ) => {
    const bf = algorithm === 'bellmanford';
    const costs = bf
      ? round.costs
      : Object.fromEntries(taken.map((id) => [id, dijkstra.costs[id]!]));
    return (
      <div className={styles.panel} style={algoColor(algorithm)}>
        <p className={styles.panelTitle}>
          <span className={styles.badge}>{bf ? 'BF' : 'DIJ'}</span>
          {title}
        </p>
        <svg
          viewBox={loop ? '0 0 360 220' : '0 0 340 220'}
          className={styles.svg}
          role="img"
          aria-label={`${title}: ${typeof caption === 'string' ? caption : ''}`}
        >
          <Arrowhead />
          {roads.map(([from, to, cost]) => (
            <Road
              key={`${from}${to}`}
              from={NEGATIVE_LAYOUT[from]!}
              to={NEGATIVE_LAYOUT[to]!}
              label={sign(cost)}
              arrow
              state={
                bf
                  ? round.changed.includes(to) && costs[from] !== undefined
                    ? 'on'
                    : undefined
                  : stopped && from === 'S' && to === 'T'
                    ? 'on'
                    : undefined
              }
            />
          ))}
          {ids.map((id) => {
            const cost = costs[id];
            const before = (previous as Record<string, number>)[id];
            const note =
              cost === undefined
                ? undefined
                : bf && before !== undefined && before !== cost
                  ? `${sign(before)} → ${sign(cost)}`
                  : sign(cost);
            return (
              <Node
                key={id}
                id={id}
                at={NEGATIVE_LAYOUT[id]!}
                kind={
                  id === 'S'
                    ? 'start'
                    : id === 'T'
                      ? 'goal'
                      : cost === undefined
                        ? undefined
                        : 'reached'
                }
                note={note}
                ring={bf ? round.changed.includes(id) : taken.at(-1) === id}
              />
            );
          })}
        </svg>
        {body}
        <p className={styles.panelCaption}>{caption}</p>
      </div>
    );
  };

  const changedText = (ids: string[]) =>
    listOf(ids.map((id) => `${id} to ${sign(round.costs[id]!)}`));
  const bfCaption = (() => {
    if (round.changed.length === 0) {
      return (
        <>
          Round {round.round} changes nothing, so every cost is final: T costs{' '}
          <span className={diagram.mono}>{sign(outcome.cost!)}</span>. <b>Right.</b>
        </>
      );
    }
    if (last && outcome.negativeLoop) {
      return (
        <>
          Round {round.round}: {changedText(round.changed)}. Still getting cheaper after as many
          rounds as there are nodes: a loop pays out every lap, so there is <b>no cheapest route</b>
          .
        </>
      );
    }
    const corrected = round.changed.filter(
      (id) => at > 0 && rounds[at - 1]!.costs[id] !== undefined,
    );
    return (
      <>
        Round {round.round}: {changedText(round.changed)}
        {corrected.length ? `, correcting ${listOf(corrected)}` : ''}.
      </>
    );
  })();
  const dijkstraCaption = stopped ? (
    <>
      Takes T at <span className={diagram.mono}>{dijkstra.cost}</span>, the cheapest waiting, and
      stops. <b>Wrong:</b> it never looked past B.
    </>
  ) : (
    <>Takes S: T joins the frontier at 2, B at 5.</>
  );

  return (
    <figure className={diagram.figure}>
      <Stepper
        at={at}
        count={rounds.length}
        onStep={setChosen}
        extra={
          <button
            type="button"
            className={diagram.toggle}
            aria-pressed={loop}
            style={algoColor('bellmanford')}
            onClick={() => {
              setLoop((on) => !on);
              setChosen(0);
            }}
          >
            {loop && <CheckIcon size={14} strokeWidth={3} className={diagram.tick} />}
            Add the loop
          </button>
        }
      >
        Step <span className={diagram.mono}>{at + 1}</span> of{' '}
        <span className={diagram.mono}>{rounds.length}</span>
        <span className={styles.aside}>
          Energy in kWh. The hill from B down to T gives 4 back
          {loop ? '; the loop X → Y → Z costs 2 + 1 − 4 = −1 a lap' : ''}.
        </span>
      </Stepper>
      <div className={styles.panels}>
        {panel('dijkstra', 'Dijkstra', null, dijkstraCaption)}
        {panel('bellmanford', 'Bellman-Ford', null, bfCaption)}
      </div>
    </figure>
  );
}

// ---- ALT ---------------------------------------------------------------------------------------

const LANDMARKS = [
  { id: 'B', label: 'B, beyond the goal' },
  { id: 'C', label: 'C, behind the start' },
  { id: 'T', label: 'T, the goal itself' },
] as const;

/** Positions in the network's layout for this screen. */
function useLayout(network: DiagramNetwork) {
  const phone = useMediaQuery(PHONE);
  const layout = phone ? 'tall' : 'wide';
  const at = (id: string) => network.nodes.find((n) => n.id === id)![layout];
  const xs = network.nodes.map((n) => n[layout][0]);
  const ys = network.nodes.map((n) => n[layout][1]);
  const pad = 56;
  const view = `${Math.min(...xs) - pad} ${Math.min(...ys) - pad} ${Math.max(...xs) - Math.min(...xs) + 2 * pad} ${Math.max(...ys) - Math.min(...ys) + 2 * pad}`;
  return { at, view };
}

const onPath = (path: readonly string[], a: string, b: string) =>
  path.some((id, i) => {
    const next = path[i + 1];
    return (id === a && next === b) || (id === b && next === a);
  });

/** The triangle trick on the six intersections: pick a landmark, see S's estimate. */
export function LandmarkFigure() {
  const [landmark, setLandmark] = useState<string>('B');
  const figure = useMemo(() => landmarkFigure(landmark), [landmark]);
  const { at, view } = useLayout(SIX);
  const formula =
    figure.via === null
      ? '0'
      : figure.second === 0
        ? `${figure.first}`
        : `${figure.first} − ${figure.second} = ${figure.estimate}`;
  const caption =
    landmark === 'T'
      ? `With the goal as the landmark the estimate is exactly ${figure.truth}, the true cost, and A* would walk straight to the goal.`
      : landmark === 'C'
        ? `Behind the start, C gives ${figure.estimate}: from C to T costs ${figure.first}, and S is ${figure.second} along the way. That's below the straight line here; another landmark may do better.`
        : `One landmark won't always beat the straight line; here B gives ${figure.estimate}. ALT keeps the largest estimate of all its landmarks, so a few well-placed ones cover most trips.`;
  return (
    <figure className={diagram.figure} style={algoColor('alt')}>
      <div className={diagram.controls}>
        <span className={styles.label}>Landmark at</span>
        <div role="radiogroup" aria-label="Where the landmark is" className={styles.choices}>
          {LANDMARKS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={landmark === id}
              onClick={() => setLandmark(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <svg
        viewBox={view}
        className={diagram.svg}
        role="img"
        aria-label={`Landmark ${landmark}: the estimate for S is ${formula}; the straight line guesses ${figure.straight}, and the true cost is ${figure.truth}.`}
      >
        {SIX.edges.map(([a, b, cost]) => (
          <Road
            key={`${a}${b}`}
            from={at(a)}
            to={at(b)}
            label={String(cost)}
            state={
              onPath(figure.solid, a, b) ? 'on' : onPath(figure.dashed, a, b) ? 'dashed' : undefined
            }
          />
        ))}
        {SIX.nodes.map(({ id }) => (
          <Node
            key={id}
            id={id}
            at={at(id)}
            kind={
              id === landmark ? 'landmark' : id === 'S' ? 'start' : id === 'T' ? 'goal' : undefined
            }
          />
        ))}
      </svg>
      <dl className={styles.sums}>
        <div>
          <dt>Landmark estimate for S</dt>
          <dd data-best>{formula}</dd>
        </div>
        <div>
          <dt>Straight-line guess</dt>
          <dd>{figure.straight}</dd>
        </div>
        <div>
          <dt>True cost S → T</dt>
          <dd>{figure.truth}</dd>
        </div>
      </dl>
      <figcaption className={diagram.caption}>{caption}</figcaption>
    </figure>
  );
}

// ---- Contraction hierarchies --------------------------------------------------------------------

const ORDER = ['C', 'B', 'D', 'S', 'A', 'T'];

/** The six intersections contracted one node at a time, with the shortcuts each one leaves. */
export function ContractionFigure() {
  const steps = useMemo(() => contractionSteps(SIX, ORDER), []);
  const [at, setAt] = useState(1);
  const { at: position, view } = useLayout(SIX);
  const step = steps[at]!;
  const gone = new Set(ORDER.slice(0, at));
  const older = steps.slice(0, at).flatMap((s) => s.shortcuts);
  const caption = (() => {
    if (step.ways.length === 0) {
      return `Nothing runs through ${step.node} any more, from one neighbour left to another, so it goes without adding anything.`;
    }
    return step.ways
      .map((way) => {
        const through = `${way.from} → ${step.node} → ${way.to} costs ${way.through}`;
        if (way.witness) {
          return `${through}; the way round, ${way.roundPath.join(' → ')}, costs ${way.round}: a witness, so no shortcut.`;
        }
        return `${through}. ${way.round === null ? 'There is no other way' : `The other way, ${way.roundPath.join(' → ')}, costs ${way.round}`}: no witness, so ${step.node} leaves a shortcut ${way.from} → ${way.to} costing ${way.through}.`;
      })
      .join(' ');
  })();
  const isShortcut = (list: typeof older, a: string, b: string) =>
    list.some((s) => (s.from === a && s.to === b) || (s.from === b && s.to === a));
  return (
    <figure className={diagram.figure} style={algoColor('ch')}>
      <Stepper at={at} count={steps.length} onStep={setAt}>
        Contracting <span className={diagram.mono}>{at + 1}</span> of{' '}
        <span className={diagram.mono}>{steps.length}</span>: node {step.node}
        <span className={styles.aside}>Order: {ORDER.join(', ')}</span>
      </Stepper>
      <svg
        viewBox={view}
        className={diagram.svg}
        role="img"
        aria-label={`Contracting ${step.node}. ${caption}`}
      >
        {SIX.edges.map(([a, b, cost]) => (
          <Road
            key={`${a}${b}`}
            from={position(a)}
            to={position(b)}
            label={gone.has(a) || gone.has(b) ? undefined : String(cost)}
            state={
              gone.has(a) || gone.has(b)
                ? 'faint'
                : a === step.node || b === step.node
                  ? 'on'
                  : undefined
            }
          />
        ))}
        {[...older, ...step.shortcuts].map((s) => (
          <Road
            key={`${s.from}${s.to}`}
            from={position(s.from)}
            to={position(s.to)}
            label={String(s.cost)}
            bend={24}
            state={isShortcut(step.shortcuts, s.from, s.to) ? 'shortcut' : 'shortcutOld'}
          />
        ))}
        {SIX.nodes.map(({ id }) => (
          <Node
            key={id}
            id={id}
            at={position(id)}
            kind={gone.has(id) ? 'gone' : undefined}
            ring={id === step.node}
            note={gone.has(id) ? `rank ${ORDER.indexOf(id)}, gone` : undefined}
          />
        ))}
      </svg>
      <figcaption className={diagram.caption}>{caption}</figcaption>
    </figure>
  );
}

/** Every node drawn at the height of its rank, and the search climbing from both ends. */
export function ClimbFigure() {
  const figure = useMemo(() => climbFigure(SIX, ORDER), []);
  const phone = useMediaQuery(PHONE);
  const width = phone ? 360 : 720;
  const row = (rank: number) => 40 + (5 - rank) * 50;
  // Spread nodes across, keeping the network's left-to-right order.
  const xs: Record<string, number> = { S: 0.2, C: 0.12, D: 0.4, A: 0.55, B: 0.72, T: 0.88 };
  const at = (id: string): [number, number] => [
    70 + xs[id]! * (width - 100),
    row(figure.rank[id]!),
  ];
  const climbed = new Set(figure.expanded.map((e) => e.node));
  const [route, cost] = [figure.route!.path, figure.route!.cost];
  const caption = `From S the search climbs to ${figure.climb[0]!.to} (${figure.climb[0]!.cost}), then along the shortcut to ${figure.meeting} (${cost}). ${figure.meeting} is the top, so its backward search has nowhere to go. ${figure.expanded.length} expansions, ${listOf(figure.expanded.map((e) => e.node))}, instead of Dijkstra's ${figure.dijkstraExpanded}; the shortcut unpacks to ${route.slice(1).join(' → ')}, the same route Dijkstra finds.`;
  return (
    <figure className={diagram.figure} style={algoColor('ch')}>
      <svg viewBox={`0 0 ${width} 330`} className={diagram.svg} role="img" aria-label={caption}>
        {[0, 1, 2, 3, 4, 5].map((rank) => (
          <g key={rank} className={styles.rank}>
            <line x1={66} x2={width - 10} y1={row(rank)} y2={row(rank)} />
            <text x={10} y={row(rank) + 4}>
              rank {rank}
            </text>
          </g>
        ))}
        {SIX.edges.map(([a, b]) => (
          <Road key={`${a}${b}`} from={at(a)} to={at(b)} state="faint" />
        ))}
        {figure.climb.map((edge) => (
          <Road
            key={`${edge.from}${edge.to}`}
            from={at(edge.from)}
            to={at(edge.to)}
            label={String(edge.cost)}
            state={edge.shortcut ? 'shortcut' : 'on'}
          />
        ))}
        {SIX.nodes.map(({ id }) => (
          <Node
            key={id}
            id={id}
            at={at(id)}
            kind={id === 'S' ? 'start' : climbed.has(id) ? 'climbed' : undefined}
            ring={id === figure.meeting}
          />
        ))}
      </svg>
      <figcaption className={diagram.caption}>{caption}</figcaption>
    </figure>
  );
}

/** ALT's eight landmarks on the recorded streets, numbered in the order they were chosen. */
export function LandmarkMap() {
  const map = useMemo(() => streetLandmarks(), []);
  const [width, height] = map.size;
  const size = 9;
  return (
    <figure className={article.mapFigure} style={algoColor('alt')}>
      <svg
        viewBox={`-12 -12 ${width + 24} ${height + 24}`}
        className={article.map}
        role="img"
        aria-label={`${map.points.length} landmarks around the edge of the streets; landmark ${map.mostUsed + 1} gave the most estimates.`}
      >
        {map.streets.map(([a, b], i) => (
          <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={article.street} />
        ))}
        <circle cx={map.start[0]} cy={map.start[1]} r={7} className={article.pointA} />
        <circle cx={map.target[0]} cy={map.target[1]} r={7} className={article.pointB} />
        {map.points.map(([x, y], i) => (
          <g key={i} className={styles.mapLandmark} data-best={i === map.mostUsed || undefined}>
            <path d={`M${x} ${y - size}L${x + size} ${y}L${x} ${y + size}L${x - size} ${y}Z`} />
            <text x={x} y={y + 3.5} textAnchor="middle">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      <figcaption className={article.mapCaption}>
        The {map.points.length} landmarks for a drive across the recorded Plaza de Mayo streets,
        numbered in the order they were picked. Number {map.mostUsed + 1} gave the most estimates on
        the way from A to B.
      </figcaption>
    </figure>
  );
}
