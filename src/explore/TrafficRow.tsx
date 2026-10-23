import type { TravelMode } from '../osm/roads';
import type { TrafficSettings } from '../traffic/settings';
import type { TrafficFailure, TrafficProvider } from '../traffic/types';
import { KeyIcon, WarningIcon } from '../ui/icons';
import { PROVIDER_NAME, rowProblem } from './trafficText';
import styles from './TrafficRow.module.css';

interface Props {
  settings: TrafficSettings;
  mode: TravelMode;
  /** Why traffic failed on the last run, if it did. */
  problem: TrafficFailure | null;
  onOpen(): void;
  onSwitch(on: boolean): void;
}

const PROVIDERS: readonly TrafficProvider[] = ['tomtom', 'here'];

/** The plan's live traffic setting: add a key, switch traffic on or off, or see what went wrong. */
export function TrafficRow({ settings, mode, problem, onOpen, onSwitch }: Props) {
  const saved = PROVIDERS.find((provider) => settings.keys[provider]);
  const on = settings.provider !== null && saved !== undefined;

  if (mode !== 'car') {
    return (
      <div className={styles.row} data-variant="quiet">
        <KeyIcon size={20} className={styles.icon} />
        <p className={styles.text}>
          <b>Live traffic is for driving.</b> Bike and walking routes use average speeds, so no
          requests are made.
        </p>
      </div>
    );
  }

  if (!saved) {
    return (
      <div className={styles.row} data-variant="empty">
        <KeyIcon size={20} className={styles.icon} />
        <p className={styles.text}>
          <b>Live traffic off.</b> Add your own TomTom or HERE key — it stays in this browser.
        </p>
        <button type="button" className={styles.button} onClick={onOpen}>
          Add key
        </button>
      </div>
    );
  }

  if (on && problem) {
    return (
      <div className={styles.row} data-variant="problem">
        <WarningIcon size={20} className={styles.icon} />
        <p className={styles.text}>
          <b>{rowProblem(settings.provider!, problem)}</b> Runs use speed limits until it works.
        </p>
        <button type="button" className={styles.button} onClick={onOpen}>
          Check key
        </button>
      </div>
    );
  }

  const provider = settings.provider ?? saved;
  return (
    <div className={styles.row} data-variant={on ? 'on' : 'off'}>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label="Live traffic"
        className={styles.switch}
        onClick={() => onSwitch(!on)}
      >
        <span className={styles.track} aria-hidden="true">
          <span className={styles.thumb} />
        </span>
      </button>
      <span className={styles.status}>
        <b>{on ? 'Live traffic on' : 'Live traffic off'}</b>
        <span className={styles.detail}>
          {on
            ? `${PROVIDER_NAME[provider]} · your key`
            : `Uses speed limits · ${PROVIDER_NAME[provider]} key saved`}
        </span>
      </span>
      <button type="button" className={styles.button} onClick={onOpen}>
        Change
      </button>
    </div>
  );
}
