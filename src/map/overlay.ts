import type { Layer } from '@deck.gl/core';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type * as maplibregl from 'maplibre-gl';
import { contractionLayers } from './advancedLayers';
import { explorationLayers } from './explorationLayers';
import type { Exploration } from './MapCanvas';
import { trafficLayers } from './trafficLayers';

/** Resolves once an overlay's deck.gl has its device; see `whenStarted`. */
const started = new WeakMap<MapboxOverlay, Promise<void>>();

/** Puts deck.gl's overlay on a map, ready for layers. */
export function addOverlay(map: maplibregl.Map) {
  let onLoad!: () => void;
  const loaded = new Promise<void>((resolve) => (onLoad = resolve));
  // Overlaid, not interleaved: deck.gl's interleaved mode does not support MapLibre 6 yet.
  const overlay = new MapboxOverlay({ interleaved: false, layers: [], onLoad });
  started.set(overlay, loaded);
  map.addControl(overlay);
  return overlay;
}

/**
 * deck.gl creates its device asynchronously, and goes on creating it after its overlay is
 * removed, where nothing can release it any more. So an overlay is only removed once it has
 * started, or after a few seconds if it never does.
 */
export function whenStarted(overlay: MapboxOverlay, timeoutMs = 5000): Promise<void> {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([started.get(overlay) ?? Promise.resolve(), timeout]);
}

/**
 * Takes deck.gl's overlay off the map and lets go of everything it held. deck.gl leaves both
 * behind: its WebGL context, which would hold on to the GPU (browsers allow about 16), and a
 * listener for screen-resolution changes, which keeps the whole overlay and its layers' data
 * reachable. So the layers go first, then the listener with the canvas context, then the context.
 */
export function removeOverlay(map: maplibregl.Map, overlay: MapboxOverlay) {
  overlay.setProps({ layers: [] });
  // The overlay keeps its Deck, and the Deck its device, to itself; reach in, but only as far as
  // they are there.
  const { _deck: deck } = overlay as unknown as {
    _deck?: {
      device?: { canvasContext?: { destroy(): void } | null; gl?: WebGL2RenderingContext } | null;
    };
  };
  const device = deck?.device;
  map.removeControl(overlay);
  device?.canvasContext?.destroy();
  device?.gl?.getExtension('WEBGL_lose_context')?.loseContext();
}

/** What deck.gl draws for the search the map shows, if any. */
export function layersFor(exploration: Exploration | null): Layer[] {
  if (!exploration) return [];
  const contraction = exploration.contraction;
  if (contraction) {
    return [
      ...contractionLayers(contraction.replay, contraction.step),
      ...explorationLayers(exploration.timeline, 0, exploration.colors, exploration.snaps),
    ];
  }
  return [
    // Traffic goes underneath, so the search stays readable on top of it.
    ...(exploration.traffic
      ? trafficLayers(exploration.traffic.live, {
          bands: exploration.traffic.bands,
          finished: exploration.step >= exploration.timeline.steps,
        })
      : []),
    ...explorationLayers(
      exploration.timeline,
      exploration.step,
      exploration.colors,
      exploration.snaps,
      exploration.highlight,
      exploration.meetLabel,
      exploration.advanced,
    ),
  ];
}
