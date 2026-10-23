export interface Camera {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface SyncedMap {
  setCamera(camera: Camera): void;
}

/**
 * Keeps comparison maps looking at the same place. Maps report moves made by hand; moves applied
 * here are not reported back, so maps never echo each other.
 */
export function createCameraSync() {
  const maps = new Set<SyncedMap>();
  let linked = true;
  let last: Camera | null = null;
  let lastFrom: SyncedMap | null = null;

  return {
    /** Adds a map, showing it the shared view if there is one. Returns whether it did. */
    join(map: SyncedMap): boolean {
      maps.add(map);
      if (!linked || !last) return false;
      map.setCamera(last);
      return true;
    },
    leave(map: SyncedMap) {
      maps.delete(map);
      if (lastFrom === map) lastFrom = null;
    },
    moved(from: SyncedMap, camera: Camera) {
      last = camera;
      lastFrom = from;
      if (!linked) return;
      for (const map of maps) if (map !== from) map.setCamera(camera);
    },
    /** Linking again brings every map to the view moved most recently. */
    setLinked(value: boolean) {
      if (value === linked) return;
      linked = value;
      if (linked && last) for (const map of maps) if (map !== lastFrom) map.setCamera(last);
    },
  };
}

export type CameraSync = ReturnType<typeof createCameraSync>;
