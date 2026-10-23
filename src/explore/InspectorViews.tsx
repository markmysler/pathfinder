import { useMemo, useState } from 'react';
import { pseudocode, type PartLines } from '../algorithms/pseudocode';
import { labelOf, type NodeLabels } from '../osm/places';
import { frontierAt, partsOfStep, type StepPart } from '../playback/frontier';
import type { Timeline } from '../playback/timeline';
import { formatCost, formatCount } from '../ui/format';
import { ChevronLeftIcon, ChevronRightIcon } from '../ui/icons';
import { PseudocodeListing } from '../ui/Pseudocode';
import type { RunView } from './Inspector';
import styles from './InspectorViews.module.css';
import { describePart } from './narration';

interface ViewProps {
  run: RunView;
  step: number;
  names: NodeLabels;
}

/** Rows shown in the frontier list. */
const ROWS = 8;

const RULE = {
  bfs: 'BFS takes the oldest first.',
  dfs: 'DFS takes the newest first.',
  greedy: 'Greedy takes the lowest h first.',
  dijkstra: 'Dijkstra takes the lowest g first.',
  astar: 'A* takes the lowest f first.',
};

/** Where each frontier node is on the map, from the positions the timeline already holds. */
function usePositions(timeline: Timeline) {
  return useMemo(() => {
    const index = new Map<number, number>();
    for (let i = 0; i < timeline.frontierCount; i++) index.set(timeline.frontierNode[i]!, i);
    return (node: number): [number, number] => {
      const i = index.get(node)!;
      return [timeline.frontierPosition[2 * i]!, timeline.frontierPosition[2 * i + 1]!];
    };
  }, [timeline]);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function FrontierView({
  run,
  step,
  names,
  compact,
  onHighlight,
}: ViewProps & { compact: boolean; onHighlight?(position: [number, number] | null): void }) {
  const { timeline: t, objective, algorithm, weight } = run;
  const { entries, waiting, outdated } = frontierAt(t, step, ROWS);
  const positionOf = usePositions(t);
  const cost = (value: number) => formatCost(value, objective);
  const w = Math.round(weight * 10) / 10;

  const values = (entry: number) => {
    const g = t.entryCost[entry]!;
    const h = t.entryEstimate[entry]!;
    switch (algorithm) {
      case 'astar':
        return {
          key: cost(g + weight * h),
          detail:
            weight === 1 ? `g ${cost(g)} + h ${cost(h)}` : `g ${cost(g)} + ${w} × h ${cost(h)}`,
        };
      case 'dijkstra':
        return { key: cost(g), detail: 'cost so far' };
      case 'greedy':
        return { key: cost(h), detail: `estimate to B · g ${cost(g)}` };
      default:
        return { key: '', detail: `joined at step ${formatCount(t.entryEnter[entry]!)}` };
    }
  };

  const more = Math.max(0, waiting - entries.length);
  return (
    <div className={styles.frontier}>
      <p className={styles.intro}>
        <span className={styles.mono}>{formatCount(waiting)}</span> waiting. {RULE[algorithm]}{' '}
        {compact ? 'Tap' : 'Hover over'} one to find it on the map.
      </p>
      <ol className={styles.rows}>
        {entries.map((entry, i) => {
          const { key, detail } = values(entry);
          const point = () => onHighlight?.(positionOf(t.entryNode[entry]!));
          const clear = () => onHighlight?.(null);
          return (
            <li key={entry}>
              <button
                type="button"
                className={styles.row}
                data-next={i === 0 && step < t.steps}
                onMouseEnter={point}
                onMouseLeave={clear}
                onFocus={point}
                onBlur={clear}
                onClick={point}
              >
                <span className={styles.rank} aria-hidden="true">
                  {i + 1}
                </span>
                <span className={styles.place}>
                  <span className={styles.name}>
                    <span className={styles.label}>{labelOf(names, t.entryNode[entry]!)}</span>
                    {i === 0 && step < t.steps && <span className={styles.next}>next</span>}
                  </span>
                  <span className={styles.detail}>{detail}</span>
                </span>
                {key && <span className={styles.key}>{key}</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {(more > 0 || outdated > 0) && (
        <p className={styles.footnote}>
          {more > 0 && `…and ${formatCount(more)} more. `}
          {outdated > 0 &&
            `${formatCount(outdated)} outdated ${plural(outdated, 'entry', 'entries')} will be skipped when ${plural(outdated, 'it comes', 'they come')} up.`}
        </p>
      )}
    </div>
  );
}

const START: PartLines = { lines: [2, 3, 4], focus: 4 };

export function CodeView({ run, step, names, playing }: ViewProps & { playing: boolean }) {
  const { timeline: t, algorithm, objective, weight } = run;
  const code = pseudocode(algorithm, weight);
  const parts = step > 0 ? partsOfStep(t, step) : [];
  const taken = Math.max(
    0,
    parts.findIndex((part) => part.kind === 'take'),
  );
  const [chosen, setChosen] = useState(taken);
  const at = playing ? taken : chosen;
  const part: StepPart | undefined = parts[at];
  const lines = part ? code.parts[part.kind]! : START;
  const cost = (value: number) => formatCost(value, objective);

  const note = (() => {
    if (!part) return '';
    if (part.kind === 'road') {
      const previous = t.entryPrevious[part.entry]!;
      if (algorithm === 'dijkstra' || algorithm === 'astar') {
        return `${cost(t.entryCost[part.entry]!)} < ${Number.isFinite(previous) ? cost(previous) : '∞'} ✓`;
      }
      return '✓';
    }
    return part.kind === 'rejected' ? '✗' : '';
  })();

  const account = part
    ? describePart(part, { timeline: t, step, algorithm, objective, weight, names })
    : 'Start: A is the only node in the frontier.';

  return (
    <div className={styles.codeView}>
      <div className={styles.stepper}>
        <button
          type="button"
          className={styles.lineButton}
          aria-label="Previous line"
          disabled={playing || at <= 0}
          onClick={() => setChosen(at - 1)}
        >
          <ChevronLeftIcon />
        </button>
        <p className={styles.position}>
          Step <span className={styles.mono}>{formatCount(step)}</span> · line by line ·{' '}
          <span className={styles.mono}>{parts.length ? at + 1 : 0}</span> of{' '}
          <span className={styles.mono}>{parts.length}</span>
        </p>
        <button
          type="button"
          className={styles.lineButton}
          aria-label="Next line"
          disabled={playing || at >= parts.length - 1}
          onClick={() => setChosen(at + 1)}
        >
          <ChevronRightIcon />
        </button>
      </div>
      <p className={styles.account}>{account}</p>
      <PseudocodeListing lines={code.lines} run={lines.lines} focus={lines.focus} note={note} />
      <p className={styles.footnote}>
        While playing, the highlight stays on line {code.parts.take!.focus}, the node each step
        takes. Pause to go through the lines of a step one by one.
      </p>
    </div>
  );
}
