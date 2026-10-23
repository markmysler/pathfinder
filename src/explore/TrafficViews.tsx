import { useId } from 'react';
import type { Objective } from '../osm/network';
import { formatCost, formatCount } from '../ui/format';
import { InfoIcon, WarningIcon } from '../ui/icons';
import type { TrafficOutcome } from '../worker/job';
import { failureNotice, PROVIDER_NAME } from './trafficText';
import styles from './TrafficViews.module.css';

type Live = Extract<TrafficOutcome, { status: 'live' }>;

const percent = (share: number) => `${Math.round(share * 100)}%`;

/** The time of day traffic was fetched, like 14:32. */
export const fetchedTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

function storyText({ story }: Live, objective: Objective): { title: string; text: string } | null {
  if (!story) return null;
  const cost = (value: number) => formatCost(value, objective);
  const { clear, best, changed, jammed, via } = story;

  if (objective === 'shortest') {
    return changed
      ? {
          title: 'A closure changed the route',
          text: `Traffic doesn’t change how long roads are, but closed roads can’t be used: the shortest route is now ${cost(best)} instead of ${cost(clear.cost)}.`,
        }
      : {
          title: 'Traffic didn’t change the route',
          text: 'Traffic doesn’t change how long roads are, and no closed road blocks the shortest route.',
        };
  }

  const slower = cost(best - clear.cost);
  if (changed) {
    const blocked = jammed
      ? jammed.share === 0
        ? ` Right now ${jammed.name} is closed, so that way can’t be driven.`
        : ` Right now ${jammed.name} is moving at ${percent(jammed.share)} of its usual speed, so that way would take ${cost(clear.costNow)}.`
      : Number.isFinite(clear.costNow)
        ? ` With today’s traffic that way would take ${cost(clear.costNow)}.`
        : ' Today a closed road blocks that way.';
    const now = via
      ? `The best route now goes along ${via}`
      : 'The best route now takes other roads';
    return {
      title: 'Traffic changed the route',
      text: `On clear roads the best route takes ${cost(clear.cost)} (the dotted line).${blocked} ${now}: ${slower} slower than on clear roads, but the fastest way today.`,
    };
  }
  const slowest = jammed
    ? ` The slowest stretch is ${jammed.name}, at ${percent(jammed.share)} of its usual speed.`
    : '';
  return best > clear.cost + 0.5
    ? {
        title: 'Traffic slowed the route',
        text: `Same roads as on a clear day, but ${slower} slower: ${cost(best)} instead of ${cost(clear.cost)}.${slowest}`,
      }
    : {
        title: 'Traffic didn’t change the route',
        text: `Same roads and the same time as on a clear day: the traffic on them is flowing.`,
      };
}

/** How live traffic changed the best route, once a run has finished. */
export function TrafficStoryCard({ outcome, objective }: { outcome: Live; objective: Objective }) {
  const id = useId();
  const told = storyText(outcome, objective);
  if (!told) return null;
  return (
    <section className={styles.story} aria-labelledby={id}>
      <h3 id={id}>
        <span className={styles.dot} aria-hidden="true" />
        {told.title}
      </h3>
      <p>{told.text}</p>
    </section>
  );
}

/** The story in one line, for the phone's sheet. */
export function trafficSummary({ story }: Live, objective: Objective): string | null {
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

/** How much of the map the traffic covered, and when it was fetched. */
export function TrafficCoverage({ outcome }: { outcome: Live }) {
  const id = useId();
  const { roads, matched, slowed, closed, provider, fetchedAt } = outcome;
  const width = (count: number) => `${roads ? (100 * count) / roads : 0}%`;
  return (
    <section className={styles.coverage} aria-labelledby={id}>
      <h3 id={id} className={styles.eyebrow}>
        Traffic data
      </h3>
      <div className={styles.bar} aria-hidden="true">
        <span style={{ width: width(matched - slowed - closed) }} />
        <span data-kind="slowed" style={{ width: width(slowed) }} />
        <span data-kind="closed" style={{ width: width(closed) }} />
      </div>
      <p>
        Live speeds on {formatCount(matched)} of {formatCount(roads)} car roads (
        {roads ? percent(matched / roads) : '0%'}): {formatCount(slowed)} slowed,{' '}
        {formatCount(closed)} closed. The rest keep their speed limits. Fetched at{' '}
        {fetchedTime(fetchedAt)} from {PROVIDER_NAME[provider]}.
      </p>
    </section>
  );
}

/** Why a run went without some or all of its traffic. Nothing when all of it arrived. */
export function TrafficNotice({
  outcome,
  onCheckKey,
}: {
  outcome: TrafficOutcome;
  onCheckKey(): void;
}) {
  if (outcome.status === 'live' && outcome.missingTiles > 0) {
    const n = outcome.missingTiles;
    return (
      <div role="status" className={styles.notice} data-kind="info">
        <InfoIcon size={18} />
        <p>
          <b>
            {n} traffic {n === 1 ? 'tile' : 'tiles'} didn’t arrive.
          </b>{' '}
          Roads there keep their speed limits.
        </p>
      </div>
    );
  }
  if (outcome.status !== 'failed') return null;
  const { title, detail } = failureNotice(outcome.provider, outcome.reason);
  return (
    <div role="status" className={styles.notice}>
      <WarningIcon size={18} />
      <div>
        <p>
          <b>{title}</b> {detail}
        </p>
        {outcome.reason !== 'quota' && (
          <button type="button" className={styles.button} onClick={onCheckKey}>
            Check key
          </button>
        )}
      </div>
    </div>
  );
}

/** The map key's traffic part: what the bands mean, and a switch to hide them. */
export function TrafficKey({
  on,
  onToggle,
  clearRoute,
}: {
  on: boolean;
  onToggle(): void;
  /** Whether the best route without traffic is drawn. */
  clearRoute: boolean;
}) {
  return (
    <div className={styles.key}>
      {clearRoute && (
        <span className={styles.keyItem}>
          <span className={styles.dotted} aria-hidden="true" />
          Without traffic
        </span>
      )}
      <button type="button" aria-pressed={on} className={styles.toggle} onClick={onToggle}>
        <span className={styles.track} aria-hidden="true">
          <span className={styles.thumb} />
        </span>
        Traffic
      </button>
      {on && (
        <>
          <span className={styles.keyItem}>
            <span className={styles.band} data-kind="slow" aria-hidden="true" />
            Slow
          </span>
          <span className={styles.keyItem}>
            <span className={styles.band} data-kind="jam" aria-hidden="true" />
            Jammed
          </span>
          <span className={styles.keyItem}>
            <span className={styles.closed} aria-hidden="true" />
            Closed
          </span>
        </>
      )}
    </div>
  );
}
