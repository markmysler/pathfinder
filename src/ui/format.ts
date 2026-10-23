import type { Objective } from '../osm/network';

const pad = (n: number) => String(n).padStart(2, '0');

/** Seconds as m:ss, or h:mm:ss from an hour up. */
export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function formatDistance(meters: number): string {
  const rounded = Math.round(meters);
  return rounded < 1000 ? `${rounded} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** A route or path cost: travel time for the fastest route, distance for the shortest. */
export const formatCost = (cost: number, objective: Objective) =>
  objective === 'fastest' ? formatDuration(cost) : formatDistance(cost);

export const formatCount = (n: number) => n.toLocaleString('en-US');
