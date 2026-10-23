import type { Layer } from '@deck.gl/core';
import { DataFilterExtension } from '@deck.gl/extensions';
import { LineLayer, PathLayer, ScatterplotLayer } from '@deck.gl/layers';
import { NEVER, type Timeline } from '../playback/timeline';

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

interface BinaryData {
  length: number;
  attributes: Record<string, { value: Float32Array; size: number }>;
}

interface Buffers {
  roads: BinaryData;
  frontier: BinaryData;
  route: { path: [number, number][] }[] | null;
}

// Built once per timeline and reused at every step: playback only changes the filter range,
// which the GPU applies, so scrubbing through a large search stays cheap.
const cache = new WeakMap<Timeline, Buffers>();

function buffersFor(timeline: Timeline): Buffers {
  let buffers = cache.get(timeline);
  if (buffers) return buffers;

  const enterLeave = new Float32Array(2 * timeline.frontierCount);
  for (let i = 0; i < timeline.frontierCount; i++) {
    enterLeave[2 * i] = timeline.frontierEnter[i]!;
    enterLeave[2 * i + 1] = timeline.frontierLeave[i]!;
  }
  const route = timeline.route;
  buffers = {
    roads: {
      length: timeline.roadCount,
      attributes: {
        getSourcePosition: { value: Float32Array.from(timeline.roadFrom), size: 2 },
        getTargetPosition: { value: Float32Array.from(timeline.roadTo), size: 2 },
        getFilterValue: { value: timeline.roadStep, size: 1 },
      },
    },
    frontier: {
      length: timeline.frontierCount,
      attributes: {
        getPosition: { value: Float32Array.from(timeline.frontierPosition), size: 2 },
        getFilterValue: { value: enterLeave, size: 2 },
      },
    },
    route: route
      ? [
          {
            path: Array.from({ length: route.positions.length / 2 }, (_, i) => [
              route.positions[2 * i]!,
              route.positions[2 * i + 1]!,
            ]),
          },
        ]
      : null,
  };
  cache.set(timeline, buffers);
  return buffers;
}

const filterByStep = new DataFilterExtension({ filterSize: 1 });
const filterByEnterAndLeave = new DataFilterExtension({ filterSize: 2 });

/** From where the user put A or B to the road node the search actually started or ended at. */
export interface SnapLink {
  from: readonly [number, number];
  to: readonly [number, number];
}

/** The deck.gl layers that draw a search at a given step. */
export function explorationLayers(
  timeline: Timeline,
  step: number,
  color: Rgb,
  snaps?: readonly SnapLink[],
  /** A node to ring, such as one picked from the frontier list. */
  highlight?: readonly [number, number] | null,
): Layer[] {
  const { roads, frontier, route } = buffersFor(timeline);
  const layers: Layer[] = [
    new LineLayer({
      id: 'explored-roads',
      data: roads,
      getColor: [...color, 170],
      getWidth: 2,
      widthUnits: 'pixels',
      extensions: [filterByStep],
      filterRange: [0, step],
    } as never),
    new ScatterplotLayer({
      id: 'frontier',
      data: frontier,
      getFillColor: [...color, 235],
      getRadius: 3,
      radiusUnits: 'pixels',
      extensions: [filterByEnterAndLeave],
      // Entered by this step, and leaves after it.
      filterRange: [
        [0, step],
        [step + 0.5, NEVER + 1],
      ],
    } as never),
  ];

  if (snaps) {
    layers.push(
      new LineLayer<SnapLink>({
        id: 'snap-links',
        data: snaps,
        getSourcePosition: (d) => [...d.from],
        getTargetPosition: (d) => [...d.to],
        getColor: [201, 209, 218, 170],
        getWidth: 1.5,
        widthUnits: 'pixels',
      }),
    );
  }

  if (step > 0 && step < timeline.steps) {
    layers.push(
      new ScatterplotLayer<{ position: [number, number] }>({
        id: 'expanding',
        data: [
          {
            position: [
              timeline.expandedPosition[2 * step]!,
              timeline.expandedPosition[2 * step + 1]!,
            ],
          },
        ],
        getPosition: (d) => d.position,
        getRadius: 7,
        radiusUnits: 'pixels',
        stroked: true,
        getFillColor: [255, 255, 255],
        getLineColor: color,
        getLineWidth: 3,
        lineWidthUnits: 'pixels',
      }),
    );
  }

  if (route && step >= timeline.steps) {
    const path = {
      data: route,
      getPath: (d: { path: [number, number][] }) => d.path,
      widthUnits: 'pixels' as const,
      capRounded: true,
      jointRounded: true,
    };
    layers.push(
      new PathLayer({ ...path, id: 'route-casing', getColor: [9, 12, 16], getWidth: 10 }),
      new PathLayer({ ...path, id: 'route', getColor: color, getWidth: 6 }),
    );
  }
  if (highlight) {
    layers.push(
      new ScatterplotLayer<{ position: [number, number] }>({
        id: 'highlight',
        data: [{ position: [highlight[0], highlight[1]] }],
        getPosition: (d) => d.position,
        getRadius: 11,
        radiusUnits: 'pixels',
        stroked: true,
        filled: false,
        getLineColor: [255, 255, 255],
        getLineWidth: 2.5,
        lineWidthUnits: 'pixels',
      }),
    );
  }

  return layers;
}
