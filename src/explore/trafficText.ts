import type { Objective } from '../osm/network';
import type { KeyCheck } from '../traffic/settings';
import type { TrafficFailure, TrafficProvider } from '../traffic/types';
import { formatCost } from '../ui/format';
import type { TrafficOutcome } from '../worker/job';

export const PROVIDER_NAME: Record<TrafficProvider, string> = { tomtom: 'TomTom', here: 'HERE' };

/** Where each provider hands out free keys. */
export const KEY_LINK: Record<TrafficProvider, string> = {
  tomtom: 'https://developer.tomtom.com/',
  here: 'https://platform.here.com/',
};

/** Why a run went without traffic, for the notice under the run card. */
export function failureNotice(provider: TrafficProvider, reason: TrafficFailure) {
  const name = PROVIDER_NAME[provider];
  switch (reason) {
    case 'key':
      return {
        title: `No live traffic: ${name} refused your key.`,
        detail: 'These routes use speed limits instead.',
      };
    case 'quota':
      return {
        title: `No live traffic: your ${name} key has used up its requests for now.`,
        detail: 'These routes use speed limits. Free keys reset daily.',
      };
    case 'unavailable':
      return {
        title: `No live traffic: ${name} didn’t answer.`,
        detail: 'These routes use speed limits. If it keeps happening, check your key.',
      };
  }
}

/** The plan row's warning after a run went without traffic. */
export function rowProblem(provider: TrafficProvider, reason: TrafficFailure) {
  const name = PROVIDER_NAME[provider];
  return {
    key: `${name} refused your key.`,
    quota: `Your ${name} key has used up its requests.`,
    unavailable: `${name} didn’t answer last time.`,
  }[reason];
}

/** What testing a key found, in the dialog. */
export function checkMessage(provider: TrafficProvider, check: KeyCheck): string {
  const name = PROVIDER_NAME[provider];
  if (check.ok) return `Works: ${name} sent traffic for a test area.`;
  switch (check.reason) {
    case 'key':
      return `${name} refused this key. Check it was copied whole, and that its traffic API is enabled.`;
    case 'quota':
      return 'This key has used up its requests for now. Free keys reset daily.';
    case 'unavailable':
      return provider === 'here'
        ? 'HERE didn’t answer. That usually means a wrong key (HERE gives the browser no reason), or a network problem.'
        : 'TomTom didn’t answer. Check your connection and try again.';
  }
}

/** The time of day traffic was fetched, like 14:32. */
export const fetchedTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

/** The story in one line, for the phone's sheet. */
export function trafficSummary(
  { story }: Extract<TrafficOutcome, { status: 'live' }>,
  objective: Objective,
): string | null {
  if (!story) return null;
  const cost = (value: number) => formatCost(value, objective);
  if (objective === 'shortest' || !story.changed) return null;
  const { jammed, via, best, clear } = story;
  const why = jammed
    ? `${jammed.name} is ${jammed.share === 0 ? 'closed' : 'jammed'}, so the best route`
    : 'With today’s traffic the best route';
  const where = via ? `takes ${via}` : 'takes other roads';
  return `${why} ${where}: ${cost(best - clear.cost)} slower than clear roads, fastest today.`;
}
