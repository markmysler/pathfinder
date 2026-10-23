import type { TrafficOutcome } from '../worker/job';

/** 14:32 today, local time, as the provider's answer time. */
export const FETCHED_AT = new Date(2026, 9, 23, 14, 32).getTime();

/** Live traffic that moved the best route off a jammed avenue. */
export function liveTraffic(overrides: Partial<Extract<TrafficOutcome, { status: 'live' }>> = {}) {
  return {
    status: 'live',
    provider: 'tomtom',
    fetchedAt: FETCHED_AT,
    missingTiles: 0,
    roads: 2310,
    matched: 1840,
    closed: 3,
    slowed: 212,
    slowRoads: {
      positions: Float64Array.from([0, 0, 0.001, 0, 0.001, 0, 0.002, 0]),
      share: Float32Array.from([0.18, 0]),
    },
    story: {
      clear: { positions: Float64Array.from([0, 0, 0.002, 0.002]), cost: 580, costNow: 1025 },
      best: 740,
      changed: true,
      jammed: { name: 'Avenida de Mayo', share: 0.18 },
      via: 'Hipólito Yrigoyen',
    },
    ...overrides,
  } satisfies TrafficOutcome;
}
