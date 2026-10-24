import { createContext, useContext, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const HOUR = 60 * 60 * 1000;

/**
 * The service worker that keeps the app usable offline. A new deployment downloads in the
 * background (looked for hourly, for tabs left open); `ready` says it is waiting, and `reload`
 * switches to it.
 */
export function useServiceWorkerUpdate() {
  const {
    needRefresh: [ready],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (registration) setInterval(() => void registration.update(), HOUR);
    },
  });
  return { ready, reload: () => void updateServiceWorker(true) };
}

/** Lets Explore say a run is open, which an update waits for. */
export const RunOpenContext = createContext<(open: boolean) => void>(() => {});

/** Tells the app whether a run is open, for as long as the caller is shown. */
export function useRunOpen(open: boolean) {
  const report = useContext(RunOpenContext);
  useEffect(() => {
    report(open);
    return () => report(false);
  }, [open, report]);
}
