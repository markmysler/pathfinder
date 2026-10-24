import { useState } from 'react';
import { RefreshIcon } from '../ui/icons';
import styles from './Toast.module.css';

/**
 * Offers to reload once a new version has been deployed and downloaded. It waits while a run is
 * open (`holding`), so reloading never throws a search away; Later puts it off until next visit,
 * which opens the new version anyway.
 */
export function UpdatePrompt({
  ready,
  holding,
  onReload,
}: {
  ready: boolean;
  holding: boolean;
  onReload(): void;
}) {
  const [later, setLater] = useState(false);
  if (!ready || holding || later) return null;
  return (
    <div role="status" className={styles.toast}>
      <RefreshIcon size={18} className={styles.icon} />
      <span className={styles.text}>Pathfinder has been updated.</span>
      <span className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onReload}>
          Reload
        </button>
        <button type="button" className={styles.secondary} onClick={() => setLater(true)}>
          Later
        </button>
      </span>
    </div>
  );
}
