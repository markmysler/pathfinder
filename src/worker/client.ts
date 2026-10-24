import type { SavedArea } from '../osm/saved';
import type { JobRequest, JobResult, ServerAttempt, Stage } from './job';
import type { PrepareProgress } from './preparations';
import type { JobError, WorkerReply, WorkerRequest } from './protocol';

export interface WorkerLike {
  postMessage(message: WorkerRequest): void;
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null;
}

export interface RunningJob {
  /** Rejects with a JobError. */
  result: Promise<JobResult>;
  cancel(): void;
}

interface Pending {
  resolve(result: JobResult): void;
  reject(error: JobError): void;
  onProgress(stage: Stage, server?: ServerAttempt): void;
  onTraffic?(done: number, total: number): void;
  onPrepare?(progress: PrepareProgress): void;
}

/** A promise-based front end to the search worker; several jobs may be in flight. */
export function createSearchClient(worker: WorkerLike) {
  let lastId = 0;
  const pending = new Map<number, Pending>();
  const asked = new Map<number, (areas: SavedArea[]) => void>();
  const ask = (message: { type: 'saved' } | { type: 'forget'; key: string }) => {
    const id = ++lastId;
    worker.postMessage({ ...message, id });
    return new Promise<SavedArea[]>((resolve) => asked.set(id, resolve));
  };

  worker.onmessage = ({ data }) => {
    if (data.type === 'saved') {
      asked.get(data.id)?.(data.areas);
      asked.delete(data.id);
      return;
    }
    const job = pending.get(data.id);
    if (!job) return;
    if (data.type === 'progress') return job.onProgress(data.stage, data.server);
    if (data.type === 'traffic') return job.onTraffic?.(data.done, data.total);
    if (data.type === 'prepare') return job.onPrepare?.(data.progress);
    pending.delete(data.id);
    if (data.type === 'done') job.resolve(data.result);
    else job.reject(data.error);
  };

  return {
    run(
      request: JobRequest,
      onProgress: (stage: Stage, server?: ServerAttempt) => void,
      /** How many pieces of live traffic have arrived, out of how many. */
      onTraffic?: (done: number, total: number) => void,
      /** How preparing landmarks or shortcuts is getting on. */
      onPrepare?: (progress: PrepareProgress) => void,
    ): RunningJob {
      const id = ++lastId;
      const result = new Promise<JobResult>((resolve, reject) => {
        pending.set(id, { resolve, reject, onProgress, onTraffic, onPrepare });
      });
      worker.postMessage({ type: 'run', id, request });
      return {
        result,
        cancel() {
          const job = pending.get(id);
          if (!job) return;
          pending.delete(id);
          worker.postMessage({ type: 'cancel', id });
          job.reject({ kind: 'cancelled', message: 'Cancelled' });
        },
      };
    },
    /** The areas saved on this device, most recently used first. */
    savedAreas: () => ask({ type: 'saved' }),
    /** Deletes a saved area's streets; answers with the areas left. */
    forgetArea: (key: string) => ask({ type: 'forget', key }),
  };
}

export type SearchClient = ReturnType<typeof createSearchClient>;
