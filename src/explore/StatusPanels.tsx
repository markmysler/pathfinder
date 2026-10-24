import { useEffect, useState, type CSSProperties } from 'react';
import type { Preparation } from '../algorithms';
import { ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { formatCount, formatMs } from '../ui/format';
import type { PrepareProgress } from '../worker/preparations';
import { MAX_ROUTE_METERS } from '../osm/area';
import { DEFAULT_ENDPOINTS } from '../osm/overpass';
import { formatDuration } from '../ui/format';
import type { TrafficProvider } from '../traffic/types';
import { CheckIcon } from '../ui/icons';
import type { ServerAttempt, Stage } from '../worker/job';
import { PROVIDER_NAME } from './trafficText';
import type { JobError } from '../worker/protocol';
import styles from './StatusPanels.module.css';

interface LoadingProps {
  stage: Stage | null;
  server?: ServerAttempt;
  /** What is being run: an algorithm's name, or "3 algorithms". */
  running: string;
  /** Live traffic downloading alongside the streets, and how much of it has arrived. */
  traffic?: { provider: TrafficProvider; done?: number; total?: number };
  /** What the chosen algorithms prepare before searching, if anything. */
  needs?: readonly Preparation[];
  prepare?: Partial<Record<Preparation, PrepareProgress>>;
  onCancel(): void;
}

function useSecondsSinceMount() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);
  return seconds;
}

function describeServer({ host, attempt }: ServerAttempt) {
  const failed = attempt === 2 ? 'The first server' : `The first ${attempt - 1} servers`;
  return `${failed} didn't answer, so Pathfinder is trying ${host} (${attempt} of ${DEFAULT_ENDPOINTS.length}).`;
}

/** One of the two downloads, with a spinner until it is in. */
function Download({ label, state, done }: { label: string; state: string; done: boolean }) {
  return (
    <span className={styles.download}>
      {done ? (
        <CheckIcon size={14} className={styles.check} />
      ) : (
        <span className={styles.smallSpinner} aria-hidden="true" />
      )}
      <span className={styles.downloadLabel}>{label}</span>
      <span className={styles.downloadState}>{state}</span>
    </span>
  );
}

function trafficState({ provider, done, total }: NonNullable<LoadingProps['traffic']>) {
  const arrived = total !== undefined && done !== undefined && done >= total;
  if (provider === 'here' || total === undefined) {
    return { state: arrived ? 'arrived' : 'asking', arrived };
  }
  return { state: `${done ?? 0} of ${total} tiles`, arrived };
}

function Done() {
  return (
    <CheckIcon
      size={18}
      strokeWidth={2.6}
      className={styles.check}
      role="img"
      aria-label="done"
      aria-hidden={false}
    />
  );
}

/** Once the streets are in: building the graph, preparing, then searching, as a checklist. */
function PreparingPanel({
  stage,
  running,
  needs,
  prepare = {},
  onCancel,
}: Required<Pick<LoadingProps, 'running' | 'needs' | 'onCancel'>> &
  Pick<LoadingProps, 'stage' | 'prepare'>) {
  const nodes = prepare.landmarks?.nodes ?? prepare.hierarchy?.nodes;
  const searching = stage === 'search';
  const step = (kind: Preparation) => {
    const progress = prepare[kind];
    const finished = progress?.ms !== undefined || (searching && progress);
    if (kind === 'landmarks') {
      const count = progress?.total ?? 8;
      return (
        <li key={kind} className={styles.step}>
          {finished ? <Done /> : <span className={styles.working} aria-hidden="true" />}
          <span>
            {progress?.reused
              ? 'ALT: landmarks reused from your last run'
              : `ALT: ${count} landmarks ${finished ? 'chosen' : 'being chosen'}`}
          </span>
          {finished && !progress?.reused && (
            <span className={styles.stepValue}>{formatMs(progress!.ms!)}</span>
          )}
        </li>
      );
    }
    const contracting = progress?.kind === 'hierarchy' ? progress : undefined;
    if (finished) {
      return (
        <li key={kind} className={styles.step}>
          <Done />
          <span>
            {contracting?.reused ? 'CH: shortcuts reused from your last run' : 'CH: map contracted'}
          </span>
          {!contracting?.reused && contracting?.ms !== undefined && (
            <span className={styles.stepValue}>
              {formatMs(contracting.ms)} · {formatCount(contracting.shortcuts)} shortcuts
            </span>
          )}
        </li>
      );
    }
    // Rounded, but never 100% until it has finished.
    const share = contracting
      ? Math.min(99, Math.round((100 * contracting.done) / contracting.total))
      : 0;
    return (
      <li
        key={kind}
        className={`${styles.step} ${styles.current}`}
        style={{ '--accent': ALGORITHM_STYLE.ch.colorA } as CSSProperties}
      >
        <span className={styles.stepLine}>
          <span className={styles.working} aria-hidden="true" />
          <span className={styles.stepName}>CH: contracting the map</span>
          <span className={styles.stepValue}>{share}%</span>
        </span>
        <span className={styles.bar} aria-hidden="true">
          <span style={{ width: `${share}%` }} />
        </span>
        {contracting && (
          <span className={styles.stepDetail}>
            {formatCount(contracting.done)} of {formatCount(contracting.total)} nodes,{' '}
            {formatCount(contracting.shortcuts)} shortcuts
          </span>
        )}
      </li>
    );
  };
  return (
    <div className={styles.panel}>
      <div role="status" className={styles.checklist}>
        <p className={styles.checklistTitle}>Getting ready to search</p>
        <ol className={styles.steps}>
          <li className={styles.step}>
            <Done />
            Streets downloaded
          </li>
          <li className={styles.step}>
            {nodes === undefined && !searching ? (
              <span className={styles.working} aria-hidden="true" />
            ) : (
              <Done />
            )}
            {nodes === undefined && !searching ? 'Building the graph' : 'Graph built'}
            {nodes !== undefined && (
              <span className={styles.stepValue}>{formatCount(nodes)} nodes</span>
            )}
          </li>
          {(['landmarks', 'hierarchy'] as const).filter((kind) => needs.includes(kind)).map(step)}
          <li className={`${styles.step} ${searching ? '' : styles.waiting}`}>
            {searching ? (
              <span className={styles.working} aria-hidden="true" />
            ) : (
              <span className={styles.notYet} aria-hidden="true" />
            )}
            Search {running}
          </li>
        </ol>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function LoadingPanel({
  stage,
  server,
  running,
  traffic,
  needs = [],
  prepare,
  onCancel,
}: LoadingProps) {
  const seconds = useSecondsSinceMount();
  if (needs.length && (stage === 'graph' || stage === 'prepare' || stage === 'search')) {
    return (
      <PreparingPanel
        stage={stage}
        running={running}
        needs={needs}
        prepare={prepare}
        onCancel={onCancel}
      />
    );
  }
  if (traffic && (stage === null || stage === 'download' || stage === 'traffic')) {
    const streetsIn = stage === 'traffic';
    const { state, arrived } = trafficState(traffic);
    return (
      <div className={styles.panel}>
        <div className={styles.row} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          <p className={styles.message}>
            {streetsIn ? 'Waiting for live traffic…' : 'Downloading streets and live traffic…'}
            <Download
              label="Streets from OpenStreetMap"
              state={streetsIn ? 'done' : 'up to a minute'}
              done={streetsIn}
            />
            {!streetsIn && server && (
              <span className={styles.detail}>{describeServer(server)}</span>
            )}
            <Download
              label={`Traffic from ${PROVIDER_NAME[traffic.provider]}`}
              state={state}
              done={arrived}
            />
          </p>
        </div>
        <p className={styles.elapsed}>{formatDuration(seconds)} so far</p>
        <div className={styles.actions}>
          <button type="button" className={styles.button} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const [message, detail] = {
    none: ['Getting ready…', ''],
    download: [
      'Downloading streets from OpenStreetMap…',
      'The public servers can take up to a minute. Next time this area loads instantly.',
    ],
    traffic: ['Waiting for live traffic…', ''],
    graph: ['Building the road graph…', ''],
    prepare: ['Preparing the map…', ''],
    search: [`Running ${running}…`, ''],
  }[stage ?? 'none']!;

  return (
    <div className={styles.panel}>
      <div className={styles.row} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.message}>
          {message}
          {detail && <span className={styles.detail}>{detail}</span>}
          {stage === 'download' && server && (
            <span className={styles.detail}>{describeServer(server)}</span>
          )}
        </p>
      </div>
      <p className={styles.elapsed}>{formatDuration(seconds)} so far</p>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function explain(error: JobError): string {
  switch (error.kind) {
    case 'route-too-long':
      return `A and B are ${(error.meters / 1000).toFixed(1)} km apart. Pathfinder handles trips up to ${MAX_ROUTE_METERS / 1000} km, so move them closer.`;
    case 'no-road':
      return 'There are no connected roads for this travel mode near A and B. Try another mode, or move the points onto streets.';
    case 'download':
      return "Couldn't download the streets: the OpenStreetMap servers are busy or unreachable. Try again in a minute.";
    case 'cancelled':
      return 'Cancelled.';
    case 'unknown':
      return `Something went wrong: ${error.message}`;
  }
}

interface ErrorProps {
  error: JobError;
  onRetry(): void;
  onBack(): void;
}

export function ErrorPanel({ error, onRetry, onBack }: ErrorProps) {
  return (
    <div className={styles.panel}>
      <p className={styles.message} role="alert">
        {explain(error)}
      </p>
      <div className={styles.actions}>
        <button type="button" className={`${styles.button} ${styles.primary}`} onClick={onRetry}>
          Try again
        </button>
        <button type="button" className={styles.button} onClick={onBack}>
          Back
        </button>
      </div>
    </div>
  );
}
