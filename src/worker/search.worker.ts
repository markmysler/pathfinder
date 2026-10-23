import { indexedDbCache } from '../osm/cache';
import { loadRoadNetwork } from '../osm/load';
import type { RoadNetwork } from '../osm/network';
import { fetchTraffic, recentTraffic } from '../traffic/fetch';
import { runJob, transferablesOf } from './job';
import { describeError, type WorkerReply, type WorkerRequest } from './protocol';

// The worker's global scope; the DOM and WebWorker typings disagree about `self`.
const scope = self as unknown as {
  postMessage(message: WorkerReply, options?: { transfer?: Transferable[] }): void;
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const cache = indexedDbCache<RoadNetwork>({ name: 'pathfinder-roads', ttlMs: WEEK_MS });
// Traffic changes by the minute, but re-running moments later should not cost the user's quota.
const recent = recentTraffic({ ttlMs: 2 * 60 * 1000 });
const running = new Map<number, AbortController>();

scope.onmessage = async ({ data }) => {
  if (data.type === 'cancel') {
    running.get(data.id)?.abort();
    running.delete(data.id);
    return;
  }

  const { id } = data;
  const controller = new AbortController();
  running.set(id, controller);
  try {
    const result = await runJob(data.request, {
      loadRoadNetwork: (area, options) => loadRoadNetwork(area, { cache, ...options }),
      fetchTraffic: (source, area, options) =>
        fetchTraffic(source, area, { cache: recent, ...options }),
      onProgress: (stage, server) => scope.postMessage({ type: 'progress', id, stage, server }),
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
