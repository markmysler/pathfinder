import type { AlgorithmId } from '../algorithms';
import type { Objective } from '../osm/network';
import { algoColor, algorithmName, ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { formatCost, formatCount, formatDistance } from '../ui/format';
import type { AlgorithmRun } from '../worker/job';
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
}

const percent = (fraction: number, digits: number) => `+${(100 * fraction).toFixed(digits)}%`;

const Pill = ({ children }: { children: string }) => (
  <span className={styles.pill}>{children}</span>
);

const None = () => <span className={styles.none}>—</span>;

function status(row: ComparisonRow) {
  if (row.status === 'searching') return 'Searching…';
  return `${row.status === 'found' ? 'Done' : 'No route'} · step ${formatCount(row.expanded)}`;
}

/** How each search compares, filling in as each one reaches B. */
export function ResultsTable({ runs, objective, step, variant = 'full', hidden = [] }: Props) {
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
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.algorithm} style={algoColor(row.algorithm)}>
              <th scope="row">
                <span className={styles.name}>
                  <span className={styles.badge}>{ALGORITHM_STYLE[row.algorithm].badge}</span>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
