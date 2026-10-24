import type { AlgorithmId } from '../algorithms';
import { AlgorithmBadge } from '../ui/AlgorithmBadge';
import type { Objective } from '../osm/network';
import { algoColor, algorithmName, ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { algorithms, type AlgorithmInfo } from '../algorithms';
import { formatCost, formatCount, formatDistance, formatMs } from '../ui/format';
import { InfoIcon } from '../ui/icons';
import type { AlgorithmRun, PreparationView } from '../worker/job';
import { compareRuns, type ComparisonRow } from './comparison';
import styles from './ResultsTable.module.css';

interface Props {
  runs: readonly AlgorithmRun[];
  objective: Objective;
  /** The step of the shared clock. */
  step: number;
  /** Compact keeps three columns for phones. */
  variant?: 'full' | 'compact';
  /** Algorithms whose maps are not on screen (compact only). */
  hidden?: readonly AlgorithmId[];
  /** What was prepared before searching; adds timing columns when anything was. */
  preparation?: PreparationView;
}

const percent = (fraction: number, digits: number) => `+${(100 * fraction).toFixed(digits)}%`;

const Pill = ({ children }: { children: string }) => (
  <span className={styles.pill}>{children}</span>
);

const None = () => <span className={styles.none}>—</span>;

function status(row: ComparisonRow) {
  if (row.status === 'searching') return 'Searching…';
  if (row.status === 'stopped') return 'Stopped · too long';
  return `${row.status === 'found' ? 'Done' : 'No route'} · step ${formatCount(row.expanded)}`;
}

/** What an algorithm prepared before its search, and how long that took. */
function preparing(id: AlgorithmId, preparation: PreparationView) {
  const { prepares } = algorithms[id] as AlgorithmInfo;
  const { landmarks, hierarchy } = preparation;
  if (prepares === 'landmarks' && landmarks) {
    return landmarks.reused
      ? '0 ms · reused'
      : `${formatMs(landmarks.ms)} · ${landmarks.node.length} landmarks`;
  }
  if (prepares === 'hierarchy' && hierarchy) {
    return hierarchy.reused
      ? '0 ms · reused'
      : `${formatMs(hierarchy.ms)} · ${formatCount(hierarchy.shortcuts)} shortcuts`;
  }
  return 'none';
}

/**
 * How many routes on these roads contraction hierarchies needs before its preparing pays off
 * against Dijkstra, from the times measured here; null if it never does or can't be told.
 */
function breakEven(runs: readonly AlgorithmRun[], preparation?: PreparationView) {
  const dijkstra = runs.find((r) => r.algorithm === 'dijkstra');
  const ch = runs.find((r) => r.algorithm === 'ch');
  const made = preparation?.hierarchy;
  if (!dijkstra || !ch || !made || made.reused) return null;
  const saved = dijkstra.searchMs - ch.searchMs;
  if (saved <= 0 || made.ms <= dijkstra.searchMs) return null;
  return Math.ceil(made.ms / saved);
}

/** How each search compares, filling in as each one reaches B. */
export function ResultsTable({
  runs,
  objective,
  step,
  variant = 'full',
  hidden = [],
  preparation,
}: Props) {
  const rows = compareRuns(runs, step);
  const weightOf = (id: AlgorithmId) => runs.find((r) => r.algorithm === id)?.weight ?? 1;
  const costLabel = objective === 'fastest' ? 'Route time' : 'Distance';
  const cost = (row: ComparisonRow) => row.route && formatCost(row.route.cost, objective);

  if (variant === 'compact') {
    return (
      <table className={`${styles.table} ${styles.compact}`}>
        <caption className={styles.hiddenCaption}>Results for all {runs.length} searches</caption>
        <thead>
          <tr>
            <th scope="col">Results · all {runs.length}</th>
            <th scope="col">{costLabel}</th>
            <th scope="col">Expanded</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const off = hidden.includes(row.algorithm);
            return (
              <tr key={row.algorithm} style={algoColor(row.algorithm)} data-hidden={off}>
                <th scope="row">
                  <span className={styles.name}>
                    <span className={styles.dot} aria-hidden="true" />
                    {ALGORITHM_STYLE[row.algorithm].short}
                    {off && <span className={styles.hiddenTag}>hidden</span>}
                  </span>
                </th>
                <td className={row.route ? styles.number : styles.word}>
                  {row.route ? (
                    <>
                      {cost(row)}{' '}
                      {row.best ? (
                        <Pill>best</Pill>
                      ) : (
                        <span className={styles.worse}>{percent(row.overBest!, 0)}</span>
                      )}
                    </>
                  ) : row.status === 'searching' ? (
                    'Searching…'
                  ) : (
                    'No route'
                  )}
                </td>
                <td className={styles.number}>{formatCount(row.expanded)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    );
  }

  const timed = Boolean(preparation?.landmarks || preparation?.hierarchy);
  const runOf = (id: AlgorithmId) => runs.find((r) => r.algorithm === id)!;
  const routes = breakEven(runs, preparation);
  const allDone = rows.every((row) => row.status !== 'searching');
  return (
    <div className={styles.scroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Algorithm</th>
            <th scope="col">Status</th>
            <th scope="col">{costLabel}</th>
            {objective === 'fastest' && <th scope="col">Distance</th>}
            <th scope="col">vs. best</th>
            <th scope="col">Nodes expanded</th>
            <th scope="col">Peak frontier</th>
            {timed && <th scope="col">Search took</th>}
            {timed && <th scope="col">Preparing, once</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.algorithm} style={algoColor(row.algorithm)}>
              <th scope="row">
                <span className={styles.name}>
                  <AlgorithmBadge algorithm={row.algorithm} className={styles.badge} />
                  {algorithmName(row.algorithm, weightOf(row.algorithm))}
                </span>
              </th>
              <td className={styles.word}>{status(row)}</td>
              <td className={styles.number}>
                {row.route ? (
                  <>
                    <span className={row.best ? styles.strong : undefined}>{cost(row)}</span>
                    {row.best && (
                      <>
                        {' '}
                        <Pill>best</Pill>
                      </>
                    )}
                  </>
                ) : (
                  <None />
                )}
              </td>
              {objective === 'fastest' && (
                <td className={styles.number}>
                  {row.route ? formatDistance(row.route.meters) : <None />}
                </td>
              )}
              <td className={styles.number}>
                {row.route && !row.best ? (
                  <span className={styles.worse}>{percent(row.overBest!, 1)}</span>
                ) : (
                  <None />
                )}
              </td>
              <td className={styles.number}>
                <span className={row.fewest ? styles.strong : undefined}>
                  {formatCount(row.expanded)}
                  {row.status === 'stopped' && '+'}
                </span>
                {row.fewest && (
                  <>
                    {' '}
                    <Pill>fewest</Pill>
                  </>
                )}
                {row.status === 'searching' && <span className={styles.soFar}> so far</span>}
              </td>
              <td className={styles.number}>{formatCount(row.peakFrontier)}</td>
              {timed && (
                <td className={styles.number}>{formatMs(runOf(row.algorithm).searchMs)}</td>
              )}
              {timed && <td className={styles.word}>{preparing(row.algorithm, preparation!)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {routes !== null && allDone && (
        <p className={styles.payoff}>
          <InfoIcon size={16} />
          <span>
            For this one route, Dijkstra is done before CH has finished preparing. CH wins once
            these roads answer about <b>{formatCount(routes)} routes</b>: that's why map apps
            prepare overnight and answer in a millisecond. Times are from your browser.
          </span>
        </p>
      )}
    </div>
  );
}
