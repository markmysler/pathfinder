// Stands in for `virtual:pwa-register/react` in every test (aliased in vite.config.ts). The real
// module only exists inside a Vite build with vite-plugin-pwa, so a test that imports it some other
// way can fail to load on some platforms. Tests that care set `serviceWorker` to say whether a new
// version is waiting, and read the reload calls from it.
import { vi } from 'vitest';

export const serviceWorker = { needRefresh: false, updateServiceWorker: vi.fn() };

export function useRegisterSW() {
  return {
    needRefresh: [serviceWorker.needRefresh, () => {}] as const,
    offlineReady: [false, () => {}] as const,
    updateServiceWorker: serviceWorker.updateServiceWorker,
  };
}
