import { useEffect, useId, useRef, useState } from 'react';
import type { TrafficSource } from '../traffic/fetch';
import type { KeyCheck, TrafficSettings } from '../traffic/settings';
import type { TrafficProvider } from '../traffic/types';
import { CheckIcon, CloseIcon, ExternalIcon, EyeIcon, EyeOffIcon, LockIcon } from '../ui/icons';
import { checkMessage, KEY_LINK, PROVIDER_NAME } from './trafficText';
import styles from './TrafficDialog.module.css';

interface Props {
  settings: TrafficSettings;
  onSave(settings: TrafficSettings): void;
  onClose(): void;
  check(source: TrafficSource): Promise<KeyCheck>;
}

const PROVIDERS: readonly TrafficProvider[] = ['tomtom', 'here'];

const HOW_MANY: Record<TrafficProvider, string> = {
  tomtom: 'A run asks for a few dozen small map tiles',
  here: 'A run asks once for the whole area',
};

type Test = { key: string; result: KeyCheck | null };

/**
 * Where the user adds their own TomTom or HERE key. A dialog on desktop and a bottom sheet on
 * phones; the key is only ever saved in this browser and sent to its own provider.
 */
export function TrafficDialog({ settings, onSave, onClose, check }: Props) {
  const titleId = useId();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [provider, setProvider] = useState<TrafficProvider>(
    settings.provider ?? PROVIDERS.find((p) => settings.keys[p]) ?? 'tomtom',
  );
  const [drafts, setDrafts] = useState(settings.keys);
  const [shown, setShown] = useState(false);
  const [tests, setTests] = useState<Partial<Record<TrafficProvider, Test>>>({});
  const name = PROVIDER_NAME[provider];
  const key = drafts[provider] ?? '';
  const test = tests[provider]?.key === key ? tests[provider] : undefined;

  useEffect(() => input.current?.focus(), [provider]);

  async function runTest() {
    const tried = key.trim();
    const forProvider = provider;
    setTests((all) => ({ ...all, [forProvider]: { key, result: null } }));
    const result = await check({ provider: forProvider, key: tried });
    setTests((all) =>
      all[forProvider]?.key === key ? { ...all, [forProvider]: { key, result } } : all,
    );
  }

  function save() {
    onSave({ provider, keys: { ...drafts, [provider]: key.trim() } });
  }

  function remove() {
    const keys = { ...settings.keys };
    delete keys[provider];
    onSave({ provider: settings.provider === provider ? null : settings.provider, keys });
  }

  return (
    <div className={styles.backdrop}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.dialog}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Live traffic
          </h2>
          <button type="button" className={styles.close} aria-label="Close" onClick={onClose}>
            <CloseIcon size={20} />
          </button>
        </header>
        <p className={styles.lede}>
          Route cars with the traffic right now instead of speed limits. Bring your own key from
          TomTom or HERE; both have a free tier.
        </p>

        <fieldset className={styles.providers}>
          <legend className="visually-hidden">Provider</legend>
          {PROVIDERS.map((p) => {
            const works = tests[p]?.key === drafts[p] && tests[p]?.result?.ok;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={p === provider}
                onClick={() => setProvider(p)}
              >
                {PROVIDER_NAME[p]}
                {works && (
                  <>
                    {' '}
                    <span className={styles.works}>· key works</span>
                  </>
                )}
              </button>
            );
          })}
        </fieldset>

        <div className={styles.field}>
          <label htmlFor={inputId} className={styles.label}>
            Your {name} API key
          </label>
          <div className={styles.keyRow}>
            <div className={styles.keyBox}>
              <input
                ref={input}
                id={inputId}
                type={shown ? 'text' : 'password'}
                value={key}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setDrafts({ ...drafts, [provider]: event.target.value })}
              />
              <button
                type="button"
                className={styles.reveal}
                aria-label={shown ? 'Hide key' : 'Show key'}
                onClick={() => setShown(!shown)}
              >
                {shown ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            </div>
            <button
              type="button"
              className={styles.secondary}
              disabled={!key.trim() || (test !== undefined && test.result === null)}
              onClick={runTest}
            >
              Test key
            </button>
          </div>
          {test && (
            <p
              role="status"
              className={styles.result}
              data-ok={test.result ? test.result.ok : undefined}
            >
              {test.result === null ? (
                <>
                  <span className={styles.spinner} aria-hidden="true" />
                  Asking {name}…
                </>
              ) : (
                <>
                  {test.result.ok ? <CheckIcon size={16} /> : <CloseIcon size={16} />}
                  {checkMessage(provider, test.result)}
                </>
              )}
            </p>
          )}
          <a className={styles.getKey} href={KEY_LINK[provider]} target="_blank" rel="noreferrer">
            No key yet? Get a free one from {name}
            <ExternalIcon size={13} />
          </a>
        </div>

        <div className={styles.privacy}>
          <LockIcon size={20} />
          <div>
            <p>
              <b>Your key stays in this browser.</b> Pathfinder has no server: the key is saved only
              on this device, and your browser asks {name} directly.
            </p>
            <p>
              So every request counts against your own key’s free allowance, not a shared one.{' '}
              {HOW_MANY[provider]}; running again within 2 minutes reuses the answer.
            </p>
          </div>
        </div>

        <footer className={styles.footer}>
          {settings.keys[provider] && (
            <button type="button" className={styles.remove} onClick={remove}>
              Remove key
            </button>
          )}
          <span className={styles.spacer} />
          <button type="button" className={styles.cancel} onClick={onClose}>
            Cancel
          </button>
          <button type="button" className={styles.primary} disabled={!key.trim()} onClick={save}>
            Save and turn on
          </button>
        </footer>
      </section>
    </div>
  );
}
