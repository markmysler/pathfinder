import type { BBox } from './area';
import type { Cache } from './cache';

export interface SavedPlace {
  name: string;
  lat: number;
  lon: number;
}

/** Streets kept on the device for a route that was run, to run again offline. */
export interface SavedArea {
  /** Where its streets are in the roads cache. */
  key: string;
  box: BBox;
  /** When a route last ran on these streets; they are kept a week from then. */
  savedAt: number;
  /** About how much room the streets take. */
  bytes: number;
  start: SavedPlace;
  target: SavedPlace;
}

export interface SavedAreas {
  /** What is kept, most recently used first. */
  list(): Promise<SavedArea[]>;
  /** The smallest kept area that covers `box`, to stand in for streets not downloaded. */
  containing(box: BBox): Promise<SavedArea | undefined>;
  save(area: SavedArea): Promise<void>;
  /** A route ran on these streets again: keep them another week. */
  touch(key: string): Promise<void>;
  forget(key: string): Promise<void>;
}

const INDEX = 'saved-areas';

const covers = (outer: BBox, inner: BBox) =>
  outer.south <= inner.south &&
  outer.west <= inner.west &&
  outer.north >= inner.north &&
  outer.east >= inner.east;

const size = ({ south, west, north, east }: BBox) => (north - south) * (east - west);

/**
 * The index of saved areas, kept in `index`, alongside their streets in `roads`. Areas not used
 * for `keepMs` are forgotten, and their streets deleted, the next time the index is read.
 */
export function savedAreas({
  index,
  roads,
  keepMs,
  now = Date.now,
}: {
  index: Cache<SavedArea[]>;
  roads: Cache<unknown>;
  keepMs: number;
  now?: () => number;
}): SavedAreas {
  const read = async () => {
    const all = (await index.get(INDEX)) ?? [];
    const kept = all.filter((area) => now() - area.savedAt <= keepMs);
    if (kept.length < all.length) {
      await Promise.all(all.filter((a) => !kept.includes(a)).map((a) => roads.delete(a.key)));
      await index.set(INDEX, kept);
    }
    return kept;
  };
  const write = (areas: SavedArea[]) => index.set(INDEX, areas);

  return {
    list: async () => (await read()).sort((a, b) => b.savedAt - a.savedAt),
    async containing(box) {
      const around = (await read()).filter((area) => covers(area.box, box));
      return around.sort((a, b) => size(a.box) - size(b.box))[0];
    },
    async save(area) {
      await write([...(await read()).filter((a) => a.key !== area.key), area]);
    },
    async touch(key) {
      const areas = await read();
      if (!areas.some((a) => a.key === key)) return;
      await write(areas.map((a) => (a.key === key ? { ...a, savedAt: now() } : a)));
    },
    async forget(key) {
      await write((await read()).filter((a) => a.key !== key));
      await roads.delete(key);
    },
  };
}
