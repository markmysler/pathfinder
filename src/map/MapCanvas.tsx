import { MapboxOverlay } from '@deck.gl/mapbox';
import * as maplibregl from 'maplibre-gl';
// MapLibre looks for its worker next to its own module, which bundling moves; point it there.
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { useEffect, useRef, useState } from 'react';
import type { Role } from '../explore/exploreState';
import type { BBox, LatLon } from '../osm/area';
import type { Timeline } from '../playback/timeline';
import { explorationLayers, type Rgb, type SnapLink } from './explorationLayers';
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
  exploration: { timeline: Timeline; step: number; color: Rgb; snaps: readonly SnapLink[] } | null;
  /** Space covered by panels, kept clear when fitting A and B into view. */
  padding: Padding;
  draggable: boolean;
  onMapClick(point: LatLon): void;
  onPinMoved(role: Role, point: LatLon): void;
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

function markerElement(role: Role) {
  const element = document.createElement('div');
  element.className = `${styles.marker} ${role === 'start' ? styles.start : styles.target}`;
  element.textContent = role === 'start' ? 'A' : 'B';
  element.setAttribute('aria-label', role === 'start' ? 'Start (A)' : 'Destination (B)');
  return element;
}

/** The MapLibre basemap with A and B markers and a deck.gl overlay for the search. */
export function MapCanvas(props: Props) {
  const { start, target, area, exploration, draggable } = props;
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const markers = useRef<Partial<Record<Role, maplibregl.Marker>>>({});
  const [loaded, setLoaded] = useState(false);
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
    // Bottom sheets cover the bottom of the map on phones, so the attribution moves up there.
    const phone = window.matchMedia?.('(max-width: 720px)').matches ?? false;
    instance.addControl(
      new maplibregl.AttributionControl({ compact: phone }),
      phone ? 'top-right' : 'bottom-right',
    );
    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    const deck = new MapboxOverlay({ interleaved: false, layers: [] });
    instance.addControl(deck);
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
      // Compact attribution starts expanded; on phones collapse it to its (i) button so it
      // does not cover the map. Larger screens keep it visible, as OSM's guidelines expect.
      if (phone) {
        container.current
          ?.querySelector('.maplibregl-ctrl-attrib')
          ?.classList.remove('maplibregl-compact-show');
      }
      setLoaded(true);
    });
    map.current = instance;
    overlay.current = deck;
    const placed = markers.current;
    return () => {
      Object.values(placed).forEach((marker) => marker.remove());
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
    if (!loaded) return;
    const source = map.current?.getSource<maplibregl.GeoJSONSource>('area');
    source?.setData(area ? outline(area) : EMPTY);
  }, [area, loaded]);

  useEffect(() => {
    overlay.current?.setProps({
      layers: exploration
        ? explorationLayers(
            exploration.timeline,
            exploration.step,
            exploration.color,
            exploration.snaps,
          )
        : [],
    });
  }, [exploration]);

  return <div ref={container} className={styles.map} data-testid="map" />;
}
