import { indexedDbCache } from '../osm/cache';
import { loadRoadNetwork } from '../osm/load';
import type { RoadNetwork } from '../osm/network';
import { sampleStreetsFor } from '../osm/sample';
import { savedAreas, type SavedArea } from '../osm/saved';
import { fetchTraffic, recentTraffic } from '../traffic/fetch';
import { runJob, transferablesOf } from './job';
import { preparationCache } from './preparations';
import { describeError, type WorkerReply, type WorkerRequest } from './protocol';

// The worker's global scope; the DOM and WebWorker typings disagree about `self`.
const scope = self as unknown as {
  postMessage(message: WorkerReply, options?: { transfer?: Transferable[] }): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
// Streets are kept a week from the last run on them, which the index of saved areas tracks and
// enforces; the cache's own limit, from when they were stored, is only a backstop.
const cache = indexedDbCache<RoadNetwork>({ name: 'pathfinder-roads', ttlMs: 30 * DAY_MS });
const saved = savedAreas({
  index: indexedDbCache<SavedArea[]>({ name: 'pathfinder-saved', ttlMs: Infinity }),
  roads: cache,
  keepMs: 7 * DAY_MS,
});
// Traffic changes by the minute, but re-running moments later should not cost the user's quota.
const recent = recentTraffic({ ttlMs: 2 * 60 * 1000 });
// Landmarks and shortcuts for the last roads used, so the next route on them starts at once.
const preparations = preparationCache();
const running = new Map<number, AbortController>();

scope.onmessage = async ({ data }) => {
  if (data.type === 'cancel') {
    running.get(data.id)?.abort();
    running.delete(data.id);
    return;
  }
  if (data.type === 'saved' || data.type === 'forget') {
    if (data.type === 'forget') await saved.forget(data.key).catch(() => undefined);
    const areas = await saved.list().catch(() => []);
    scope.postMessage({ type: 'saved', id: data.id, areas });
    return;
  }

  const { id } = data;
  const controller = new AbortController();
  running.set(id, controller);
  try {
    const result = await runJob(data.request, {
      loadRoadNetwork: async (area, options) => {
        // Routes inside the bundled Plaza de Mayo streets (the sample route among them) need no
        // download at all.
        const sample = options.ends && (await sampleStreetsFor(options.ends));
        if (sample) return { network: sample.network, fromCache: true, box: sample.box };
        return loadRoadNetwork(area, { cache, saved, offline: !navigator.onLine, ...options });
      },
      fetchTraffic: (source, area, options) =>
        fetchTraffic(source, area, { cache: recent, ...options }),
      onProgress: (stage, server) => scope.postMessage({ type: 'progress', id, stage, server }),
      onTrafficProgress: (done, total) => scope.postMessage({ type: 'traffic', id, done, total }),
      onPrepare: (progress) => scope.postMessage({ type: 'prepare', id, progress }),
      preparations,
      signal: controller.signal,
    });
    if (!controller.signal.aborted) {
      scope.postMessage({ type: 'done', id, result }, { transfer: transferablesOf(result) });
    }
  } catch (error) {
    if (!controller.signal.aborted) {
      scope.postMessage({ type: 'error', id, error: describeError(error) });
    }
  } finally {
    running.delete(id);
  }
};
