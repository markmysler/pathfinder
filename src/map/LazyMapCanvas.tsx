import { lazy, Suspense, useEffect, useState } from 'react';
import type { MapCanvasProps } from './MapCanvas';
import styles from './LazyMapCanvas.module.css';

const MapCanvas = lazy(() =>
  import('./MapCanvas').then((module) => ({ default: module.MapCanvas })),
);

/** Calls back once the browser is idle, or soon if it can't tell. */
function whenIdle(callback: () => void) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(callback, { timeout: 500 });
    return () => cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 50);
  return () => clearTimeout(id);
}

/**
 * The map, loaded on its own after the page: MapLibre and deck.gl are most of the app's size, and
 * everything else works without them in the meantime. Its download starts once the page around it
 * has painted, so it never holds that up.
 */
export function LazyMapCanvas(props: MapCanvasProps) {
  const [wanted, setWanted] = useState(false);
  useEffect(() => whenIdle(() => setWanted(true)), []);
  const loading = (
    <div role="status" className={styles.loading}>
      <span className={styles.spinner} aria-hidden="true" />
      Loading the map…
    </div>
  );
  return wanted ? (
    <Suspense fallback={loading}>
      <MapCanvas {...props} />
    </Suspense>
  ) : (
    loading
  );
}
