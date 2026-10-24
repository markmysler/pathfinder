import { createSearchClient, type WorkerLike } from './client';
import type { WorkerReply, WorkerRequest } from './protocol';
import type { JobRequest } from './job';
import type { SavedArea } from '../osm/saved';

const request = {
  start: { lat: 0, lon: 0 },
  target: { lat: 0, lon: 0.01 },
  mode: 'walk',
  objective: 'shortest',
  algorithms: ['bfs'],
} satisfies JobRequest;

const saved: SavedArea = {
  key: 'roads-v1:a',
  box: { south: 0, west: 0, north: 0.01, east: 0.01 },
  savedAt: 1,
  bytes: 1000,
  start: { name: 'A', lat: 0, lon: 0 },
  target: { name: 'B', lat: 0, lon: 0.01 },
};

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

  it('forwards how preparing is getting on', async () => {
    const { worker } = fakeWorker();
    const prepare: unknown[] = [];
    const job = createSearchClient(worker).run(
      request,
      () => {},
      undefined,
      (progress) => prepare.push(progress),
    );
    const progress = {
      kind: 'hierarchy',
      done: 256,
      total: 900,
      nodes: 900,
      shortcuts: 40,
    } as const;
    worker.reply({ type: 'prepare', id: 1, progress });
    worker.reply({ type: 'prepare', id: 2, progress });
    worker.reply({ type: 'done', id: 1, result: {} as never });
    await job.result;
    expect(prepare).toEqual([progress]);
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

  it('lists the areas saved on this device', async () => {
    const { worker, sent } = fakeWorker();
    const areas = createSearchClient(worker).savedAreas();
    expect(sent).toEqual([{ type: 'saved', id: 1 }]);
    worker.reply({ type: 'saved', id: 1, areas: [saved] });
    await expect(areas).resolves.toEqual([saved]);
  });

  it('forgets a saved area and answers with what is left', async () => {
    const { worker, sent } = fakeWorker();
    const left = createSearchClient(worker).forgetArea('roads-v1:a');
    expect(sent).toEqual([{ type: 'forget', id: 1, key: 'roads-v1:a' }]);
    worker.reply({ type: 'saved', id: 1, areas: [] });
    await expect(left).resolves.toEqual([]);
  });

  it('gives each job its own id', () => {
    const { worker, sent } = fakeWorker();
    const client = createSearchClient(worker);
    client.run(request, () => {});
    client.run(request, () => {});
    expect(sent.map((m) => m.id)).toEqual([1, 2]);
  });
});
