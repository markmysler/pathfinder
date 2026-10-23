import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';

export type Route = 'explore' | 'learn';

const subscribeToHash = (onChange: () => void) => {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
};
const currentRoute = (): Route =>
  window.location.hash.startsWith('#/learn') ? 'learn' : 'explore';

/** The page named by the URL hash; hash routes work on static hosting with no server setup. */
export function useHashRoute(): Route {
  return useSyncExternalStore(subscribeToHash, currentRoute, () => 'explore');
}

/** Calls onFrame with the milliseconds since the previous animation frame while running. */
export function useAnimationClock(running: boolean, onFrame: (elapsedMs: number) => void) {
  const callback = useRef(onFrame);
  useEffect(() => {
    callback.current = onFrame;
  });

  useEffect(() => {
    if (!running) return;
    let active = true;
    let last: number | null = null;
    let id = requestAnimationFrame(function frame(time) {
      if (!active) return;
      if (last !== null) callback.current(time - last);
      last = time;
      id = requestAnimationFrame(frame);
    });
    return () => {
      active = false;
      cancelAnimationFrame(id);
    };
  }, [running]);
}

/** Whether a CSS media query matches, kept up to date. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => list.removeEventListener('change', onChange);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

export const PHONE = '(max-width: 720px)';

/** The rendered height of an element (border box), kept up to date; 0 until measured. */
export function useElementHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}
