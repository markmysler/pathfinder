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

/** `digits` more decimals than usual, for telling apart costs that would otherwise read the same. */
function formatPrecise(cost: number, objective: Objective, digits: number): string {
  if (objective === 'shortest') {
    return cost < 1000 ? `${cost.toFixed(digits)} m` : `${(cost / 1000).toFixed(digits + 1)} km`;
  }
  const scale = 10 ** digits;
  const scaled = Math.round(cost * scale);
  const whole = Math.floor(scaled / scale);
  const fraction = String(scaled % scale).padStart(digits, '0');
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = `${pad(whole % 60)}.${fraction}`;
  return h > 0 ? `${h}:${pad(m)}:${s}` : `${m}:${s}`;
}

/**
 * Costs to compare, formatted so that different ones never read the same: if any two would,
 * all of them get one more decimal, or two if one is not enough.
 */
export function formatCostsApart(costs: readonly number[], objective: Objective): string[] {
  const clash = (shown: string[]) =>
    costs.some((a, i) => costs.some((b, j) => i < j && a !== b && shown[i] === shown[j]));
  let shown = costs.map((cost) => formatCost(cost, objective));
  for (let digits = 1; digits <= 2 && clash(shown); digits++) {
    shown = costs.map((cost) => formatPrecise(cost, objective, digits));
  }
  return shown;
}

export const formatCount = (n: number) => n.toLocaleString('en-US');
