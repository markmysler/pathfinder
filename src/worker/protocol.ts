import { RouteTooLongError } from '../osm/area';
import { OverpassError } from '../osm/overpass';
import { NoRoadNearbyError } from '../osm/prepare';
import type { JobRequest, JobResult, ServerAttempt, Stage } from './job';
import type { PrepareProgress } from './preparations';

export type WorkerRequest =
  { type: 'run'; id: number; request: JobRequest } | { type: 'cancel'; id: number };

export type JobError =
  | { kind: 'route-too-long'; message: string; meters: number }
  | { kind: 'no-road' | 'download' | 'cancelled' | 'unknown'; message: string };

export type WorkerReply =
  | { type: 'progress'; id: number; stage: Stage; server?: ServerAttempt }
  | { type: 'traffic'; id: number; done: number; total: number }
  | { type: 'prepare'; id: number; progress: PrepareProgress }
  | { type: 'done'; id: number; result: JobResult }
  | { type: 'error'; id: number; error: JobError };

/** Errors cross the worker boundary as plain data the UI can turn into a helpful message. */
export function describeError(error: unknown): JobError {
  if (error instanceof RouteTooLongError) {
    return { kind: 'route-too-long', message: error.message, meters: error.meters };
  }
  if (error instanceof NoRoadNearbyError) return { kind: 'no-road', message: error.message };
  if (error instanceof OverpassError) return { kind: 'download', message: error.message };
  if ((error as { name?: unknown } | null)?.name === 'AbortError') {
    return { kind: 'cancelled', message: 'Cancelled' };
  }
  return { kind: 'unknown', message: error instanceof Error ? error.message : String(error) };
}
