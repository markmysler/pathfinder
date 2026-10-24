import type { MapboxOverlay } from '@deck.gl/mapbox';
import * as maplibregl from 'maplibre-gl';
// MapLibre looks for its worker next to its own module, which bundling moves; point it there.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';
import '../styles/maplibre.css';
import type { Role } from '../explore/exploreState';
import type { BBox, LatLon } from '../osm/area';
import type { Timeline } from '../playback/timeline';
import type { Camera, CameraSync, SyncedMap } from './cameraSync';
import type { AdvancedView, Rgb, SnapLink } from './explorationLayers';
import type { ContractionReplay } from '../worker/preparations';
import type { LiveTraffic } from './trafficLayers';
import styles from './MapCanvas.module.css';

/** OpenFreeMap's dark style: free OpenStreetMap vector tiles with no API key. */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

export interface Padding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The search a map draws, at one step. */
export interface Exploration {
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
}

export interface MapCanvasProps {
  start: LatLon | null;
  target: LatLon | null;
  /** Outline of the area that will be downloaded, while planning. */
  area: BBox | null;
  exploration: Exploration | null;
  /** Space covered by panels, kept clear when fitting A and B into view. */
  padding: Padding;
  draggable: boolean;
  onMapClick(point: LatLon): void;
  onPinMoved(role: Role, point: LatLon): void;
  /** Comparison maps share a camera through this; read once, when the map is created. */
  sync?: CameraSync;
  /** A small map in a grid or stack: compact attribution, and no zoom buttons if `bare`. */
  card?: 'framed' | 'bare';
  /** What screen readers call the map; maps side by side each need their own name. */
  name?: string;
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

type OverlayModule = typeof import('./overlay');
let overlayModule: Promise<OverlayModule> | undefined;
/** deck.gl draws the searches; it loads with the first one, as planning never needs it. */
const loadOverlay = () => (overlayModule ??= import('./overlay'));

/** The MapLibre basemap with A and B markers and a deck.gl overlay for the search. */
export function MapCanvas(props: MapCanvasProps) {
  const { start, target, area, exploration, draggable } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const deck = useRef<OverlayModule | null>(null);
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
      locale: { 'Map.Title': latest.current.name ?? 'Map' },
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
      if (deck.current && overlay.current) {
        deck.current.removeOverlay(instance, overlay.current);
        overlay.current = deck.current.addOverlay(instance);
      }
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
      const [module, drawn] = [deck.current, overlay.current];
      if (module && drawn) {
        void module.whenStarted(drawn).then(() => {
          module.removeOverlay(instance, drawn);
          instance.remove();
        });
      } else {
        instance.remove();
      }
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
    const instance = map.current;
    // Nothing drawn yet, and nothing to draw: no need for deck.gl.
    if (!drawable || !instance || (!exploration && !overlay.current)) return;
    let current = true;
    void loadOverlay().then((module) => {
      if (!current || map.current !== instance) return;
      deck.current = module;
      overlay.current ??= module.addOverlay(instance);
      overlay.current.setProps({ layers: module.layersFor(exploration) });
    });
    return () => {
      current = false;
    };
  }, [exploration, drawable]);

  return <div ref={container} className={styles.map} data-testid="map" />;
}
