import { useState, type FormEvent, type KeyboardEvent } from 'react';
import type { Geocoder, Place } from '../geo/nominatim';
import type { LatLon } from '../osm/area';
import { PointBadge } from '../ui/icons';
import type { Role } from './exploreState';
import styles from './PlaceInput.module.css';

interface Props {
  role: Role;
  place: Place | null;
  geocoder: Geocoder;
  /** Results near this point rank higher. */
  near?: LatLon;
  /** Offline, searching can't reach the address service. */
  online?: boolean;
  onChoose(place: Place): void;
}

type Status = 'idle' | 'searching' | 'empty' | 'error' | 'offline';

const MESSAGES: Record<Exclude<Status, 'offline'>, string> = {
  idle: '',
  searching: 'Searching…',
  empty: 'No places found. Try another name, or click the map.',
  error: "Address search isn't available right now. You can still click the map.",
};

/** An address field that searches when submitted (Nominatim does not allow search-as-you-type). */
export function PlaceInput({ role, place, geocoder, near, online = true, onChoose }: Props) {
  const label = role === 'start' ? 'Start' : 'Destination';
  const [query, setQuery] = useState(place?.name ?? '');
  const [results, setResults] = useState<Place[] | null>(null);
  const [status, setStatus] = useState<Status>('idle');

  // Follow the place when it changes elsewhere, e.g. a pin dropped on the map.
  const [shownPlace, setShownPlace] = useState(place);
  if (place !== shownPlace) {
    setShownPlace(place);
    setQuery(place?.name ?? '');
    setResults(null);
    setStatus('idle');
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) return;
    if (!online) {
      setResults(null);
      return setStatus('offline');
    }
    setStatus('searching');
    try {
      const found = await geocoder.search(query, { near });
      setResults(found);
      setStatus(found.length > 0 ? 'idle' : 'empty');
    } catch {
      setResults(null);
      setStatus('error');
    }
  }

  function choose(chosen: Place) {
    setResults(null);
    onChoose(chosen);
  }

  function closeOnEscape(event: KeyboardEvent) {
    if (event.key === 'Escape') setResults(null);
  }

  return (
    <form
      className={styles.form}
      role="search"
      aria-label={`Search for ${label}`}
      onSubmit={search}
      onKeyDown={closeOnEscape}
    >
      <label className={styles.field}>
        <PointBadge role={role} />
        <span className="visually-hidden">{label}</span>
        <input
          className={styles.input}
          type="text"
          enterKeyHint="search"
          autoComplete="off"
          placeholder={role === 'start' ? 'Search for A' : 'Search for B'}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {results && results.length > 0 && (
        <ul className={styles.results} aria-label={`Places matching ${query}`}>
          {results.map((result) => (
            <li key={`${result.lat},${result.lon}`}>
              <button type="button" className={styles.result} onClick={() => choose(result)}>
                <span className={styles.resultName}>{result.name}</span>
                <span className={styles.resultDetail}>{result.detail}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {status === 'offline' && (
        <p className={`${styles.status} ${styles.offline}`} role="status">
          <b>Searching needs a connection</b>
          <span>
            Pick a saved route below, or click the map inside a saved area to place{' '}
            {role === 'start' ? 'A' : 'B'}.
          </span>
        </p>
      )}
      {status !== 'idle' && status !== 'offline' && (
        <p className={styles.status} role="status">
          {MESSAGES[status]}
        </p>
      )}
    </form>
  );
}
