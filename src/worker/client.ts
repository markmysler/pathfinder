import type { JobRequest, JobResult, Stage } from './job';
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
  onProgress(stage: Stage): void;
}

/** A promise-based front end to the search worker; several jobs may be in flight. */
export function createSearchClient(worker: WorkerLike) {
  let lastId = 0;
  const pending = new Map<number, Pending>();

  worker.onmessage = ({ data }) => {
    const job = pending.get(data.id);
    if (!job) return;
    if (data.type === 'progress') return job.onProgress(data.stage);
    pending.delete(data.id);
    if (data.type === 'done') job.resolve(data.result);
    else job.reject(data.error);
  };

  return {
    run(request: JobRequest, onProgress: (stage: Stage) => void): RunningJob {
      const id = ++lastId;
      const result = new Promise<JobResult>((resolve, reject) => {
        pending.set(id, { resolve, reject, onProgress });
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
  };
}

export type SearchClient = ReturnType<typeof createSearchClient>;
