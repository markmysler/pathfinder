import { useState } from 'react';
import { haversineMeters } from '../graph/geo';
import type { LatLon } from '../osm/area';
import type { SavedArea } from '../osm/saved';
import { TrashIcon } from '../ui/icons';
import styles from './SavedRoutes.module.css';

/** How long streets are kept after the last run on them; the worker's index forgets them then. */
const KEEP_DAYS = 7;
/** Phones list this many until asked for more. */
const PHONE_SHOWN = 2;

const megabytes = (bytes: number) => `${Math.max(0.1, bytes / 1_000_000).toFixed(1)} MB`;

const startOfDay = (time: number) => new Date(time).setHours(0, 0, 0, 0);
/** Calendar days from `earlier` to `later`, in local time. */
const daysBetween = (earlier: number, later: number) =>
  Math.round((startOfDay(later) - startOfDay(earlier)) / (24 * 60 * 60 * 1000));

function ago(days: number) {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function describe({ start, target, savedAt, bytes }: SavedArea, now: number, short: boolean) {
  const km = (haversineMeters(start.lat, start.lon, target.lat, target.lon) / 1000).toFixed(1);
  const days = daysBetween(savedAt, now);
  if (short) return `${km} km · ${ago(days)} · ${megabytes(bytes)}`;
  const left = KEEP_DAYS - days;
  const until = left === 1 ? ', kept until tomorrow' : left <= 0 ? ', kept until later today' : '';
  return `${km} km apart · saved ${ago(days)}${until} · ${megabytes(bytes)}`;
}

const same = (a: LatLon | null, b: LatLon) =>
  a !== null && Math.abs(a.lat - b.lat) < 1e-7 && Math.abs(a.lon - b.lon) < 1e-7;

interface Props {
  areas: SavedArea[];
  /** The route being planned, to mark if it is one of these. */
  start: LatLon | null;
  target: LatLon | null;
  now: number;
  phone?: boolean;
  onChoose(area: SavedArea): void;
  onForget(area: SavedArea): void;
}

/** Routes whose streets are on this device, to run offline. */
export function SavedRoutes({
  areas,
  start,
  target,
  now,
  phone = false,
  onChoose,
  onForget,
}: Props) {
  const [all, setAll] = useState(false);
  const where = phone ? 'this phone' : 'this device';
  const shown = phone && !all ? areas.slice(0, PHONE_SHOWN) : areas;
  const more = areas.length - shown.length;
  const total = areas.reduce((sum, area) => sum + area.bytes, 0);

  return (
    <section
      id="saved-routes"
      tabIndex={-1}
      aria-labelledby="saved-routes-title"
      className={styles.saved}
    >
      <h2 id="saved-routes-title" className={styles.title}>
        <span>Saved on {where}</span>
        {areas.length > 0 && <span className={styles.total}>{megabytes(total)}</span>}
      </h2>
      {areas.length === 0 ? (
        <p className={styles.note}>
          Nothing is saved on {where} yet. Routes you run online are kept for a week.
        </p>
      ) : (
        <ul className={styles.list}>
          {shown.map((area) => {
            const name = `${area.start.name} → ${area.target.name}`;
            const chosen = same(start, area.start) && same(target, area.target);
            return (
              <li key={area.key} className={styles.item} data-chosen={chosen}>
                <button
                  type="button"
                  className={styles.choose}
                  aria-pressed={chosen}
                  onClick={() => onChoose(area)}
                >
                  <span className={styles.name}>{name}</span>
                  <span className={styles.meta}>{describe(area, now, phone)}</span>
                </button>
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove the saved streets for ${area.start.name} to ${area.target.name}`}
                  onClick={() => onForget(area)}
                >
                  <TrashIcon size={17} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 && (
        <button type="button" className={styles.more} onClick={() => setAll(true)}>
          {more} more saved {more === 1 ? 'route' : 'routes'}
        </button>
      )}
      {!phone && areas.length > 0 && (
        <p className={styles.note}>
          Streets you download are kept for a week after each run. Saved routes work in every mode,
          fastest or shortest.
        </p>
      )}
    </section>
  );
}
