import { MAX_ROUTE_METERS } from '../osm/area';
import type { Stage } from '../worker/job';
import type { JobError } from '../worker/protocol';
import styles from './StatusPanels.module.css';

interface LoadingProps {
  stage: Stage | null;
  algorithmName: string;
  onCancel(): void;
}

export function LoadingPanel({ stage, algorithmName, onCancel }: LoadingProps) {
  const [message, detail] = {
    none: ['Getting ready…', ''],
    download: [
      'Downloading streets from OpenStreetMap…',
      'The public servers can take up to a minute. Next time this area loads instantly.',
    ],
    graph: ['Building the road graph…', ''],
    search: [`Running ${algorithmName}…`, ''],
  }[stage ?? 'none']!;

  return (
    <div className={styles.panel}>
      <div className={styles.row} role="status">
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.message}>
          {message}
          {detail && <span className={styles.detail}>{detail}</span>}
        </p>
      </div>
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
