import { useMemo, useState } from 'react';
import { algorithms, type AlgorithmId } from '../algorithms';
import { PHONE, useMediaQuery } from '../app/hooks';
import { algoColor, ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';
import {
  bothWaysCaption,
  bothWaysStates,
  caption,
  diagramStates,
  type BothWaysState,
  type DiagramState,
} from './diagram';
import type { DiagramNetwork } from './networks';
import styles from './StepDiagram.module.css';

interface Props {
  network: DiagramNetwork;
  algorithm: AlgorithmId;
  /** Offers a replay of the same network as this algorithm. */
  compareWith?: AlgorithmId;
}

/** How the replay buttons name an algorithm. */
const replayName = (id: AlgorithmId) =>
  algorithms[id].bidirectional ? 'Both ends' : `As ${ALGORITHM_STYLE[id].short}`;

type Status = 'explored' | 'next' | 'frontier' | 'unreached';

function statusOf(state: DiagramState, id: string): Status {
  if (state.next === id) return 'next';
  if (state.explored.includes(id)) return 'explored';
  if (state.frontier.some((f) => f.id === id)) return 'frontier';
  return 'unreached';
}

/** The numbers worth showing in a node's box, for the algorithm at hand. */
function valuesOf(algorithm: AlgorithmId, g: number | undefined, h: number) {
  const informed = algorithm === 'astar' || algorithm === 'greedy';
  if (g === undefined) return informed ? `h ${h}` : '';
  if (algorithm === 'astar') return `g ${g} · h ${h} · f ${g + h}`;
  if (algorithm === 'greedy') return `h ${h} · g ${g}`;
  return `g ${g}`;
}

/** A tiny road network with a real search stepping through it, one expansion at a time. */
export function StepDiagram({ network, algorithm, compareWith }: Props) {
  const [showingOther, setShowingOther] = useState(false);
  const shown = showingOther && compareWith ? compareWith : algorithm;
  const bothWays = algorithms[shown].bidirectional;
  const states = useMemo(
    () => (bothWays ? bothWaysStates(network, shown) : diagramStates(network, shown)),
    [network, shown, bothWays],
  );
  const best = useMemo(() => diagramStates(network, 'dijkstra').at(-1)?.route?.cost, [network]);
  const [chosen, setChosen] = useState(0);
  const at = Math.min(chosen, states.length - 1);
  const phone = useMediaQuery(PHONE);
  const layout = phone ? 'tall' : 'wide';
  const box = phone ? { w: 124, h: bothWays ? 76 : 64 } : { w: 136, h: bothWays ? 80 : 68 };
  // Fit the picture to its boxes, with a small margin, whatever the layout's coordinates.
  const xs = network.nodes.map((n) => n[layout][0]);
  const ys = network.nodes.map((n) => n[layout][1]);
  const margin = 8;
  const left = Math.min(...xs) - box.w / 2 - margin;
  const top = Math.min(...ys) - box.h / 2 - margin;
  const width = Math.max(...xs) - Math.min(...xs) + box.w + 2 * margin;
  const height = Math.max(...ys) - Math.min(...ys) + box.h + 2 * margin;
  const position = (id: string) => network.nodes.find((n) => n.id === id)![layout];

  const controls = (
    <>
      <div className={styles.controls}>
        <button
          type="button"
          className={styles.stepButton}
          aria-label="Previous step"
          disabled={at === 0}
          onClick={() => setChosen(at - 1)}
        >
          <ChevronLeftIcon />
        </button>
        <p className={styles.position}>
          Step <span className={styles.mono}>{at + 1}</span> of{' '}
          <span className={styles.mono}>{states.length}</span>
          {bothWays && (
            <>
              {' · '}
              <span
                className={styles.sideDot}
                data-side={(states[at] as BothWaysState).side}
                aria-hidden="true"
              />
              from {(states[at] as BothWaysState).side}
            </>
          )}
        </p>
        <button
          type="button"
          className={styles.stepButton}
          aria-label="Next step"
          disabled={at === states.length - 1}
          onClick={() => setChosen(at + 1)}
        >
          <ChevronRightIcon />
        </button>
        {compareWith && !phone && (
          <button
            type="button"
            className={styles.toggle}
            aria-pressed={showingOther}
            style={algoColor(compareWith)}
            onClick={() => setShowingOther((on) => !on)}
          >
            {showingOther && <CheckIcon size={14} strokeWidth={3} className={styles.tick} />}
            Show as {ALGORITHM_STYLE[compareWith].short}
          </button>
        )}
      </div>
      {compareWith && phone && (
        <div role="group" aria-label="Replay as" className={styles.segmented}>
          {[algorithm, compareWith].map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={shown === id}
              style={algoColor(id)}
              onClick={() => setShowingOther(id === compareWith)}
            >
              <span className={styles.dot} aria-hidden="true" data-on={shown === id} />
              {replayName(id)}
            </button>
          ))}
        </div>
      )}
    </>
  );
  const frame = { left, top, width, height };

  if (bothWays) {
    return (
      <figure className={styles.figure} style={algoColor(shown)}>
        {controls}
        <BothWaysPicture
          network={network}
          state={states[at] as BothWaysState}
          step={at + 1}
          layout={layout}
          box={box}
          frame={frame}
        />
      </figure>
    );
  }

  const state = states[at] as DiagramState;
  const onRoute = (a: string, b: string) => {
    const path = state.route?.path ?? [];
    return path.some((id, i) => (id === a && path[i + 1] === b) || (id === b && path[i + 1] === a));
  };
  const used = (a: string, b: string) =>
    state.reached.get(b)?.from === a || state.reached.get(a)?.from === b;

  const description = network.nodes
    .map((n) => {
      const status = statusOf(state, n.id);
      const role = n.id === network.source ? 'start, ' : n.id === network.target ? 'target, ' : '';
      return `${n.id}: ${role}${status === 'unreached' ? 'not reached' : status}`;
    })
    .join('; ');

  return (
    <figure className={styles.figure} style={algoColor(shown)}>
      {controls}

      <div className={styles.canvas}>
        <svg
          viewBox={`${left} ${top} ${width} ${height}`}
          className={styles.svg}
          role="img"
          aria-label={`Step ${at + 1}. ${description}.`}
        >
          {network.edges.map(([a, b, cost]) => {
            const [x1, y1] = position(a);
            const [x2, y2] = position(b);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            // Labels sit beside the road: above a level one, to the right of a steep one.
            const level = Math.abs(y2 - y1) < Math.abs(x2 - x1);
            return (
              <g key={`${a}${b}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={styles.road}
                  data-used={used(a, b) || undefined}
                  data-route={onRoute(a, b) || undefined}
                />
                <text
                  x={level ? mx : mx + 14}
                  y={level ? my - 10 : my + 5}
                  className={styles.cost}
                  textAnchor={level ? 'middle' : 'start'}
                >
                  {cost}
                </text>
              </g>
            );
          })}
          {network.nodes.map((node) => {
            const [x, y] = node[layout];
            const status = statusOf(state, node.id);
            const role =
              node.id === network.source
                ? 'start'
                : node.id === network.target
                  ? 'target'
                  : status === 'unreached'
                    ? ''
                    : status;
            const g = state.reached.get(node.id)?.g;
            return (
              <g key={node.id} className={styles.node} data-status={status}>
                <rect x={x - box.w / 2} y={y - box.h / 2} width={box.w} height={box.h} rx={12} />
                <text x={x} y={y - 4} textAnchor="middle" className={styles.name}>
                  <tspan className={styles.id}>{node.id}</tspan>
                  {role && ` · ${role}`}
                </text>
                <text x={x} y={y + 16} textAnchor="middle" className={styles.values}>
                  {valuesOf(shown, status === 'unreached' ? undefined : g, node.h)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <ul className={styles.legend} aria-label="Legend">
        <li>
          <span className={styles.swatch} data-status="explored" aria-hidden="true" />
          Explored
        </li>
        <li>
          <span className={styles.swatch} data-status="frontier" aria-hidden="true" />
          In the frontier
        </li>
        <li>
          <span className={styles.swatch} data-status="next" aria-hidden="true" />
          Explored next
        </li>
        <li>
          <span className={styles.swatch} data-status="unreached" aria-hidden="true" />
          Not reached yet
        </li>
        <li>
          <span className={styles.roadSwatch} aria-hidden="true" />
          Road used to reach a node
        </li>
      </ul>
      <figcaption className={styles.caption}>
        <b>Step {at + 1}.</b> {caption(state, shown, best)}
      </figcaption>
    </figure>
  );
}

interface PictureProps {
  network: DiagramNetwork;
  state: BothWaysState;
  step: number;
  layout: 'wide' | 'tall';
  box: { w: number; h: number };
  frame: { left: number; top: number; width: number; height: number };
}

/** A step of a search from both ends: each side's explored nodes, frontiers and roads. */
function BothWaysPicture({ network, state, step, layout, box, frame }: PictureProps) {
  const position = (id: string) => network.nodes.find((n) => n.id === id)![layout];
  const sides = ['A', 'B'] as const;
  const usedBy = (a: string, b: string) =>
    sides.find(
      (side) => state.reached[side].get(b)?.from === a || state.reached[side].get(a)?.from === b,
    );
  const route = state.route?.path ?? [];
  const meetAt = state.meeting ? route.indexOf(state.meeting.id) : -1;
  const routeSide = (a: string, b: string) => {
    const i = route.findIndex(
      (id, k) => (id === a && route[k + 1] === b) || (id === b && route[k + 1] === a),
    );
    if (i < 0) return undefined;
    return i < meetAt ? 'A' : 'B';
  };
  const describe = (id: string) => {
    const parts: string[] = [];
    for (const side of sides) {
      const g = state.reached[side].get(id)?.g;
      if (state.explored[side].includes(id))
        parts.push(`explored ${side === 'A' ? 'from' : 'to'} ${side}, ${g}`);
      else if (g !== undefined)
        parts.push(
          `${parts.length ? '' : 'reached '}${side === 'A' ? 'from' : 'to'} ${side}, ${g}`,
        );
    }
    const role = id === network.source ? 'start, ' : id === network.target ? 'target, ' : '';
    const text = parts.length ? parts.join(', and ') : 'not reached';
    return `${id}: ${role}${text}${state.meeting?.id === id ? '; best meeting so far' : ''}`;
  };

  return (
    <>
      <div className={styles.canvas}>
        <svg
          viewBox={`${frame.left} ${frame.top} ${frame.width} ${frame.height}`}
          className={styles.svg}
          role="img"
          aria-label={`Step ${step}. ${network.nodes.map((n) => describe(n.id)).join('; ')}.`}
        >
          {network.edges.map(([a, b, cost]) => {
            const [x1, y1] = position(a);
            const [x2, y2] = position(b);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2;
            const level = Math.abs(y2 - y1) < Math.abs(x2 - x1);
            return (
              <g key={`${a}${b}`}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={styles.road}
                  data-side={usedBy(a, b)}
                  data-route={routeSide(a, b)}
                />
                <text
                  x={level ? mx : mx + 14}
                  y={level ? my - 10 : my + 5}
                  className={styles.cost}
                  textAnchor={level ? 'middle' : 'start'}
                >
                  {cost}
                </text>
              </g>
            );
          })}
          {network.nodes.map((node) => {
            const [x, y] = node[layout];
            const explored = sides.filter((side) => state.explored[side].includes(node.id));
            const reached = sides.filter((side) => state.reached[side].has(node.id));
            const side =
              explored.length === 1
                ? explored[0]
                : explored.length
                  ? 'both'
                  : reached.length === 1
                    ? reached[0]
                    : reached.length
                      ? 'both'
                      : undefined;
            const status = explored.length ? 'explored' : reached.length ? 'frontier' : 'unreached';
            const meeting = state.meeting?.id === node.id;
            const role =
              node.id === network.source
                ? 'start'
                : node.id === network.target
                  ? 'goal'
                  : reached.length === 2
                    ? 'both'
                    : reached.length
                      ? `front. ${reached[0]}`
                      : '';
            return (
              <g
                key={node.id}
                className={styles.node}
                data-side={side}
                data-state={status}
                data-meeting={meeting || undefined}
              >
                <rect x={x - box.w / 2} y={y - box.h / 2} width={box.w} height={box.h} rx={12} />
                {meeting && (
                  <path
                    className={styles.meetMark}
                    d={`M${x + box.w / 2} ${y - box.h / 2 - 9}l9 9-9 9-9-9z`}
                  />
                )}
                <text x={x} y={y - 12} textAnchor="middle" className={styles.name}>
                  <tspan className={styles.id}>{node.id}</tspan>
                  {role && ` · ${role}`}
                </text>
                {sides
                  .filter((s) => state.reached[s].has(node.id))
                  .map((s, i) => (
                    <text
                      key={s}
                      x={x}
                      y={y + 8 + 17 * i}
                      textAnchor="middle"
                      className={styles.values}
                      data-side={s}
                    >
                      {s === 'A' ? 'from A' : 'to B'} {state.reached[s].get(node.id)!.g}
                    </text>
                  ))}
              </g>
            );
          })}
        </svg>
      </div>

      <ul className={styles.legend} aria-label="Key">
        <li>
          <span className={styles.swatch} data-side="A" data-status="explored" aria-hidden="true" />
          Explored from A
        </li>
        <li>
          <span className={styles.swatch} data-side="B" data-status="explored" aria-hidden="true" />
          Explored from B
        </li>
        <li>
          <span className={styles.swatch} data-status="frontier" aria-hidden="true" />
          In a frontier
        </li>
        <li>
          <span className={styles.diamond} aria-hidden="true" />
          Best meeting so far
        </li>
      </ul>
      <figcaption className={styles.caption}>
        <b>Step {step}.</b> {bothWaysCaption(state)}
      </figcaption>
    </>
  );
}
