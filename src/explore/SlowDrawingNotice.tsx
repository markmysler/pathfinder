import { useState } from 'react';
import { drawingInSoftware } from '../map/graphics';
import { GaugeIcon } from '../ui/icons';
import styles from './TrafficViews.module.css';

const SEEN = 'pathfinder:slow-drawing-seen';

function browserStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Said once per browser, beside the first search drawn: without graphics acceleration, big
 * searches freeze the page while the map draws them.
 */
export function SlowDrawingNotice({
  software = drawingInSoftware(),
  storage = browserStorage(),
}: {
  software?: boolean;
  storage?: Storage;
}) {
  const [seen, setSeen] = useState(() => {
    try {
      return storage?.getItem(SEEN) === 'yes';
    } catch {
      return false;
    }
  });
  if (!software || seen) return null;
  const dismiss = () => {
    setSeen(true);
    try {
      storage?.setItem(SEEN, 'yes');
    } catch {
      // Without storage it shows again next visit; nothing worse.
    }
  };
  return (
    <div role="status" className={styles.notice}>
      <GaugeIcon size={18} />
      <div>
        <p>
          <b>This browser is drawing the map without graphics acceleration.</b> Big searches can
          freeze the page for several seconds. Turning on hardware acceleration in the browser’s
          settings fixes it.
        </p>
        <button type="button" className={styles.button} onClick={dismiss}>
          Got it
        </button>
      </div>
    </div>
  );
}
