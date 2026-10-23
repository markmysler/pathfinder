import { createSearchClient, type WorkerLike } from './client';
import type { WorkerReply, WorkerRequest } from './protocol';
import type { JobRequest } from './job';

const request = {
  start: { lat: 0, lon: 0 },
  target: { lat: 0, lon: 0.01 },
  mode: 'walk',
  objective: 'shortest',
  algorithms: ['bfs'],
} satisfies JobRequest;

function fakeWorker() {
  const sent: WorkerRequest[] = [];
  const worker: WorkerLike & { reply(message: WorkerReply): void } = {
    onmessage: null,
    postMessage: (message: WorkerRequest) => void sent.push(message),
    reply(message) {
      this.onmessage?.({ data: message } as MessageEvent<WorkerReply>);
    },
  };
  return { worker, sent };
}

describe('createSearchClient', () => {
  it('sends a numbered run request and resolves with its result', async () => {
    const { worker, sent } = fakeWorker();
    const client = createSearchClient(worker);
    const job = client.run(request, () => {});
    expect(sent).toEqual([{ type: 'run', id: 1, request }]);
    worker.reply({ type: 'done', id: 1, result: { marker: 'result' } as never });
    await expect(job.result).resolves.toEqual({ marker: 'result' });
  });

  it('forwards progress for its own job only', async () => {
    const { worker } = fakeWorker();
    const client = createSearchClient(worker);
    const progress: unknown[][] = [];
    const job = client.run(request, (...args) => progress.push(args));
    worker.reply({ type: 'progress', id: 1, stage: 'download' });
    worker.reply({ type: 'progress', id: 1, stage: 'download', server: { host: 'b', attempt: 2 } });
    worker.reply({ type: 'progress', id: 99, stage: 'graph' });
    worker.reply({ type: 'progress', id: 1, stage: 'search' });
    worker.reply({ type: 'done', id: 1, result: {} as never });
    await job.result;
    expect(progress).toEqual([
      ['download', undefined],
      ['download', { host: 'b', attempt: 2 }],
      ['search', undefined],
    ]);
  });

  it('forwards how much traffic has arrived', async () => {
    const { worker } = fakeWorker();
    const traffic: [number, number][] = [];
    const job = createSearchClient(worker).run(
      request,
      () => {},
      (done, total) => traffic.push([done, total]),
    );
    worker.reply({ type: 'traffic', id: 1, done: 3, total: 36 });
    worker.reply({ type: 'traffic', id: 2, done: 1, total: 1 });
    worker.reply({ type: 'done', id: 1, result: {} as never });
    await job.result;
    expect(traffic).toEqual([[3, 36]]);
  });

  it('rejects with the error the worker reported', async () => {
    const { worker } = fakeWorker();
    const job = createSearchClient(worker).run(request, () => {});
    worker.reply({
      type: 'error',
      id: 1,
      error: { kind: 'route-too-long', message: 'too far', meters: 20_000 },
    });
    await expect(job.result).rejects.toEqual({
      kind: 'route-too-long',
      message: 'too far',
      meters: 20_000,
    });
  });

  it('cancels a job by telling the worker and rejecting as cancelled', async () => {
    const { worker, sent } = fakeWorker();
    const job = createSearchClient(worker).run(request, () => {});
    job.cancel();
    expect(sent.at(-1)).toEqual({ type: 'cancel', id: 1 });
    await expect(job.result).rejects.toMatchObject({ kind: 'cancelled' });
  });

  it('gives each job its own id', () => {
    const { worker, sent } = fakeWorker();
    const client = createSearchClient(worker);
    client.run(request, () => {});
    client.run(request, () => {});
    expect(sent.map((m) => m.id)).toEqual([1, 2]);
  });
});
