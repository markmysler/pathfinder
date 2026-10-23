export interface Cache<T> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T): Promise<void>;
}

interface CacheOptions {
  name: string;
  ttlMs: number;
  /** Defaults to the browser's; pass undefined to disable caching. */
  indexedDB?: IDBFactory | undefined;
  now?: () => number;
}

interface Entry<T> {
  storedAt: number;
  value: T;
}

const STORE = 'entries';

const settle = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/**
 * A key-value cache in IndexedDB whose entries expire after `ttlMs`. Storage can be missing or
 * blocked (private windows, strict settings), so every failure degrades to a cache miss.
 */
export function indexedDbCache<T>(options: CacheOptions): Cache<T> {
  const factory = 'indexedDB' in options ? options.indexedDB : globalThis.indexedDB;
  const now = options.now ?? Date.now;

  let database: Promise<IDBDatabase | null> | undefined;
  const open = () =>
    (database ??= new Promise((resolve) => {
      try {
        if (!factory) return resolve(null);
        const request = factory.open(options.name, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      } catch {
        resolve(null);
      }
    }));

  return {
    async get(key) {
      try {
        const db = await open();
        if (!db) return undefined;
        const entry = (await settle(db.transaction(STORE).objectStore(STORE).get(key))) as
          Entry<T> | undefined;
        if (!entry || now() - entry.storedAt > options.ttlMs) return undefined;
        return entry.value;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      try {
        const db = await open();
        if (!db) return;
        const entry: Entry<T> = { storedAt: now(), value };
        await settle(db.transaction(STORE, 'readwrite').objectStore(STORE).put(entry, key));
      } catch {
        // A full or unavailable cache only costs a re-download next time.
      }
    },
  };
}
