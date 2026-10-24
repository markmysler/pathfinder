import { MapboxOverlay } from '@deck.gl/mapbox';
import * as maplibregl from 'maplibre-gl';
// MapLibre looks for its worker next to its own module, which bundling moves; point it there.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import type { Role } from '../explore/exploreState';
import type { BBox, LatLon } from '../osm/area';
import type { Timeline } from '../playback/timeline';
import type { Camera, CameraSync, SyncedMap } from './cameraSync';
import { contractionLayers } from './advancedLayers';
import { explorationLayers, type AdvancedView, type Rgb, type SnapLink } from './explorationLayers';
import type { ContractionReplay } from '../worker/preparations';
import { trafficLayers, type LiveTraffic } from './trafficLayers';
import styles from './MapCanvas.module.css';

/** OpenFreeMap's dark style: free OpenStreetMap vector tiles with no API key. */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Props {
  start: LatLon | null;
  target: LatLon | null;
  /** Outline of the area that will be downloaded, while planning. */
  area: BBox | null;
  exploration: {
    timeline: Timeline;
    step: number;
    /** One colour, or one per side of a search from both ends. */
    colors: Rgb | readonly [Rgb, Rgb];
    snaps: readonly SnapLink[];
    /** Labels a bidirectional search's best meeting point, given its index. */
    meetLabel?: (meeting: number) => string;
    /** A node to ring, picked from the inspector's frontier list. */
    highlight?: readonly [number, number] | null;
    /** Live traffic the search ran with, and whether to draw its slow roads. */
    traffic?: { live: LiveTraffic; bands: boolean } | null;
    /** What an advanced algorithm adds to its search. */
    advanced?: AdvancedView;
    /** Watching contraction hierarchies prepare, at this step, instead of its search. */
    contraction?: { replay: ContractionReplay; step: number } | null;
  } | null;
  /** Space covered by panels, kept clear when fitting A and B into view. */
  padding: Padding;
  draggable: boolean;
  onMapClick(point: LatLon): void;
  onPinMoved(role: Role, point: LatLon): void;
  /** Comparison maps share a camera through this; read once, when the map is created. */
  sync?: CameraSync;
  /** A small map in a grid or stack: compact attribution, and no zoom buttons if `bare`. */
  card?: 'framed' | 'bare';
}

maplibregl.setWorkerUrl(mapWorkerUrl);

const EMPTY = { type: 'FeatureCollection' as const, features: [] };

function outline({ south, west, north, east }: BBox) {
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: {
      type: 'LineString' as const,
      coordinates: [
        [west, south],
        [east, south],
        [east, north],
        [west, north],
        [west, south],
      ],
    },
  };
}

function cameraOf(map: maplibregl.Map): Camera {
  const { lng, lat } = map.getCenter();
  return {
    center: [lng, lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

function markerElement(role: Role) {
  const element = document.createElement('div');
  element.className = `${styles.marker} ${role === 'start' ? styles.start : styles.target}`;
  element.textContent = role === 'start' ? 'A' : 'B';
  element.setAttribute('aria-label', role === 'start' ? 'Start (A)' : 'Destination (B)');
  return element;
}

/**
 * Takes deck.gl's overlay off the map and lets go of everything it held. deck.gl leaves both
 * behind: its WebGL context, which would hold on to the GPU (browsers allow about 16), and a
 * listener for screen-resolution changes, which keeps the whole overlay and its layers' data
 * reachable. So the layers go first, then the listener with the canvas context, then the context.
 */
function removeOverlay(map: maplibregl.Map, overlay: MapboxOverlay) {
  overlay.setProps({ layers: [] });
  const canvas = overlay.getCanvas();
  // The overlay keeps its Deck, and the Deck its device, to itself; reach in, but only as far as
  // they are there.
  const { _deck: deck } = overlay as unknown as {
    _deck?: { device?: { canvasContext?: { destroy(): void } | null } | null };
  };
  const canvasContext = deck?.device?.canvasContext;
  map.removeControl(overlay);
  canvasContext?.destroy();
  canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
}

/** The MapLibre basemap with A and B markers and a deck.gl overlay for the search. */
export function MapCanvas(props: Props) {
  const { start, target, area, exploration, draggable } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const markers = useRef<Partial<Record<Role, maplibregl.Marker>>>({});
  const [loaded, setLoaded] = useState(false);
  /** False while the browser has taken the map's WebGL context away, as a GPU reset does. */
  const [drawable, setDrawable] = useState(true);
  /** Set when the map joined a shared view, which then takes the place of the first framing. */
  const adopted = useRef(false);
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });

  useEffect(() => {
    const instance = new maplibregl.Map({
      container: container.current!,
      style: MAP_STYLE_URL,
      center: [0, 20],
      zoom: 1.5,
      attributionControl: false,
    });
    const { card, sync } = latest.current;
    // Bottom sheets cover the bottom of the map on phones, so the attribution moves up there.
    const phone = window.matchMedia?.('(max-width: 720px)').matches ?? false;
    const compact = phone || card !== undefined;
    instance.addControl(
      new maplibregl.AttributionControl({ compact }),
      phone && !card ? 'top-right' : 'bottom-right',
    );
    if (card !== 'bare') {
      instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    }
    // Overlaid, not interleaved: deck.gl's interleaved mode does not support MapLibre 6 yet.
    const addOverlay = () => {
      const deck = new MapboxOverlay({ interleaved: false, layers: [] });
      instance.addControl(deck);
      overlay.current = deck;
    };
    addOverlay();

    const member: SyncedMap = { setCamera: (camera) => instance.jumpTo(camera) };
    if (sync) {
      adopted.current = sync.join(member);
      // Only moves made by hand carry the input event; moves applied by the sync do not.
      instance.on('move', (event: { originalEvent?: unknown }) => {
        if (event.originalEvent) sync.moved(member, cameraOf(instance));
      });
    }
    // While the context is lost MapLibre drops its style, and anything that reads it throws. It
    // puts the style back once the context returns; the search is drawn again from there.
    // deck.gl can't get a lost context back, so the search moves to a fresh overlay.
    instance.on('webglcontextlost', () => setDrawable(false));
    instance.on('webglcontextrestored', () => {
      if (overlay.current) removeOverlay(instance, overlay.current);
      addOverlay();
      setDrawable(true);
    });
    instance.on('click', (event: maplibregl.MapMouseEvent) =>
      latest.current.onMapClick({ lat: event.lngLat.lat, lon: event.lngLat.lng }),
    );
    instance.on('load', () => {
      instance.addSource('area', { type: 'geojson', data: EMPTY });
      instance.addLayer({
        id: 'area',
        type: 'line',
        source: 'area',
        paint: {
          'line-color': '#e8ecf1',
          'line-opacity': 0.55,
          'line-width': 1.5,
          'line-dasharray': [3, 2],
        },
      });
      // Compact attribution starts expanded; collapse it to its (i) button so it does not cover
      // the map. Full-size maps on larger screens keep it visible, as OSM's guidelines expect.
      if (compact) {
        container.current
          ?.querySelector('.maplibregl-ctrl-attrib')
          ?.classList.remove('maplibregl-compact-show');
      }
      setLoaded(true);
    });
    map.current = instance;
    const placed = markers.current;
    return () => {
      sync?.leave(member);
      Object.values(placed).forEach((marker) => marker.remove());
      if (overlay.current) removeOverlay(instance, overlay.current);
      instance.remove();
      map.current = null;
      overlay.current = null;
    };
  }, []);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    for (const [role, point] of [
      ['start', start],
      ['target', target],
    ] as const) {
      let marker = markers.current[role];
      if (!point) {
        marker?.remove();
        delete markers.current[role];
        continue;
      }
      if (!marker) {
        marker = new maplibregl.Marker({ element: markerElement(role), draggable: true });
        marker.on('dragend', () => {
          const { lat, lng } = marker!.getLngLat();
          latest.current.onPinMoved(role, { lat, lon: lng });
        });
        markers.current[role] = marker.setLngLat([point.lon, point.lat]).addTo(instance);
      }
      marker.setLngLat([point.lon, point.lat]).setDraggable(draggable);
    }
  }, [start, target, draggable]);

  // Frame what matters: the download area while planning, otherwise A and B.
  const frameKey = area
    ? `${area.south},${area.west},${area.north},${area.east}`
    : `${start?.lat},${start?.lon},${target?.lat},${target?.lon}`;
  useEffect(() => {
    const instance = map.current;
    const { start: a, target: b, area: box, padding: space } = latest.current;
    if (!instance || (!a && !b)) return;
    if (adopted.current) {
      adopted.current = false;
      return;
    }
    if (box || (a && b)) {
      const bounds = box
        ? new maplibregl.LngLatBounds([box.west, box.south], [box.east, box.north])
        : new maplibregl.LngLatBounds([a!.lon, a!.lat], [a!.lon, a!.lat]).extend([b!.lon, b!.lat]);
      instance.fitBounds(bounds, { padding: space, maxZoom: 16, duration: 600 });
    } else {
      const only = (a ?? b)!;
      instance.easeTo({ center: [only.lon, only.lat], zoom: Math.max(instance.getZoom(), 14) });
    }
  }, [frameKey]);

  useEffect(() => {
    if (!loaded || !drawable) return;
    const source = map.current?.getSource<maplibregl.GeoJSONSource>('area');
    source?.setData(area ? outline(area) : EMPTY);
  }, [area, loaded, drawable]);

  useEffect(() => {
    if (!drawable) return;
    const contraction = exploration?.contraction;
    overlay.current?.setProps({
      layers: contraction
        ? [
            ...contractionLayers(contraction.replay, contraction.step),
            ...explorationLayers(exploration.timeline, 0, exploration.colors, exploration.snaps),
          ]
        : exploration
          ? [
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
            ]
          : [],
    });
  }, [exploration, drawable]);

  return <div ref={container} className={styles.map} data-testid="map" />;
}
