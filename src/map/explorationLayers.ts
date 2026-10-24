import type { Layer } from '@deck.gl/core';
import { DataFilterExtension } from '@deck.gl/extensions';
import { IconLayer, LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import { meetingAt, NEVER, type Timeline } from '../playback/timeline';
import { importantLayer, landmarkLayers, roundLayers, type AdvancedView } from './advancedLayers';
import { hexToRgb, type Rgb } from './hexToRgb';

export { hexToRgb, type Rgb };
export type { AdvancedView };

interface BinaryData {
  length: number;
  attributes: Record<string, { value: Float32Array; size: number }>;
}

type Path = { path: [number, number][] }[];

/** Everything drawn per side: index 0 forward from A, 1 backward from B (empty if one-way). */
interface Buffers {
  roads: [BinaryData, BinaryData];
  frontier: [BinaryData, BinaryData];
  /** The route, split where the sides met for a bidirectional search. */
  route: [Path, Path | null] | null;
}

// Built once per timeline and reused at every step: playback only changes the filter range,
// which the GPU applies, so scrubbing through a large search stays cheap.
const cache = new WeakMap<Timeline, Buffers>();

function buffersFor(timeline: Timeline): Buffers {
  let buffers = cache.get(timeline);
  if (buffers) return buffers;

  const roads = [0, 1].map((side): BinaryData => {
    const picked: number[] = [];
    for (let i = 0; i < timeline.roadCount; i++) if (timeline.roadSide[i] === side) picked.push(i);
    const from = new Float32Array(2 * picked.length);
    const to = new Float32Array(2 * picked.length);
    const step = new Float32Array(picked.length);
    picked.forEach((road, i) => {
      from.set(timeline.roadFrom.subarray(2 * road, 2 * road + 2), 2 * i);
      to.set(timeline.roadTo.subarray(2 * road, 2 * road + 2), 2 * i);
      step[i] = timeline.roadStep[road]!;
    });
    return {
      length: picked.length,
      attributes: {
        getSourcePosition: { value: from, size: 2 },
        getTargetPosition: { value: to, size: 2 },
        getFilterValue: { value: step, size: 1 },
      },
    };
  }) as [BinaryData, BinaryData];

  const frontier = [0, 1].map((side): BinaryData => {
    const picked: number[] = [];
    for (let i = 0; i < timeline.frontierCount; i++) {
      if (timeline.frontierSide[i] === side) picked.push(i);
    }
    const position = new Float32Array(2 * picked.length);
    const enterLeave = new Float32Array(2 * picked.length);
    picked.forEach((node, i) => {
      position.set(timeline.frontierPosition.subarray(2 * node, 2 * node + 2), 2 * i);
      enterLeave[2 * i] = timeline.frontierEnter[node]!;
      enterLeave[2 * i + 1] = timeline.frontierLeave[node]!;
    });
    return {
      length: picked.length,
      attributes: {
        getPosition: { value: position, size: 2 },
        getFilterValue: { value: enterLeave, size: 2 },
      },
    };
  }) as [BinaryData, BinaryData];

  buffers = { roads, frontier, route: routePaths(timeline) };
  cache.set(timeline, buffers);
  return buffers;
}

function routePaths(timeline: Timeline): Buffers['route'] {
  const route = timeline.route;
  if (!route) return null;
  const points = Array.from({ length: route.positions.length / 2 }, (_, i): [number, number] => [
    route.positions[2 * i]!,
    route.positions[2 * i + 1]!,
  ]);
  const last = timeline.meetCount - 1;
  if (last < 0) return [[{ path: points }], null];
  // Split where the sides met: the half from A was found going forward, the rest going backward.
  const [lon, lat] = [timeline.meetPosition[2 * last], timeline.meetPosition[2 * last + 1]];
  const at = Math.max(
    0,
    points.findIndex(([x, y]) => x === lon && y === lat),
  );
  return [[{ path: points.slice(0, at + 1) }], [{ path: points.slice(at) }]];
}

/** A white diamond with a dark edge, as the meeting point is drawn everywhere else. */
const DIAMOND = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
    '<path d="M12 2l10 10-10 10L2 12z" fill="#fff" stroke="#090c10" stroke-width="2.5" ' +
    'stroke-linejoin="round"/></svg>',
)}`;

const filterByStep = new DataFilterExtension({ filterSize: 1 });
const filterByEnterAndLeave = new DataFilterExtension({ filterSize: 2 });

/** From where the user put A or B to the road node the search actually started or ended at. */
export interface SnapLink {
  from: readonly [number, number];
  to: readonly [number, number];
}

/**
 * The deck.gl layers that draw a search at a given step. A bidirectional search takes a colour
 * per side: its side from B is drawn in the second, with rings for its frontier.
 */
export function explorationLayers(
  timeline: Timeline,
  step: number,
  colors: Rgb | readonly [Rgb, Rgb],
  snaps?: readonly SnapLink[],
  /** A node to ring, such as one picked from the frontier list. */
  highlight?: readonly [number, number] | null,
  /** Labels the best meeting point of a bidirectional search, given its index. */
  meetLabel?: (meeting: number) => string,
  /** What an advanced algorithm adds: rounds, landmarks or the most important nodes. */
  advanced?: AdvancedView,
): Layer[] {
  const { roads, frontier, route } = buffersFor(timeline);
  // Bellman-Ford dims earlier rounds, so the current one stands out.
  const rounds = advanced?.kind === 'rounds' ? advanced.rounds : null;
  const [color, colorB] = (Array.isArray(colors[0]) ? colors : [colors, colors]) as [Rgb, Rgb];
  const both = timeline.bidirectional;
  // Entered by this step, and leaves after it.
  const waiting = [
    [0, step],
    [step + 0.5, NEVER + 1],
  ];
  const layers: Layer[] = [
    new LineLayer({
      id: 'explored-roads',
      data: roads[0],
      getColor: [...color, rounds ? 90 : 170],
      getWidth: 2,
      widthUnits: 'pixels',
      extensions: [filterByStep],
      filterRange: [0, step],
    } as never),
  ];
  if (rounds) layers.push(...roundLayers(timeline, step, rounds, roads[0], color));
  if (advanced?.kind === 'hierarchy') layers.push(importantLayer(advanced));
  if (both) {
    layers.push(
      new LineLayer({
        id: 'explored-roads-b',
        data: roads[1],
        getColor: [...colorB, 170],
        getWidth: 2,
        widthUnits: 'pixels',
        extensions: [filterByStep],
        filterRange: [0, step],
      } as never),
    );
  }
  layers.push(
    new ScatterplotLayer({
      id: 'frontier',
      data: frontier[0],
      getFillColor: [...color, 235],
      getRadius: 3,
      radiusUnits: 'pixels',
      extensions: [filterByEnterAndLeave],
      filterRange: waiting,
    } as never),
  );
  if (both) {
    layers.push(
      new ScatterplotLayer({
        id: 'frontier-b',
        data: frontier[1],
        filled: false,
        stroked: true,
        getLineColor: [...colorB, 235],
        getLineWidth: 1.5,
        lineWidthUnits: 'pixels',
        getRadius: 3.5,
        radiusUnits: 'pixels',
        extensions: [filterByEnterAndLeave],
        filterRange: waiting,
      } as never),
    );
  }

  if (advanced?.kind === 'landmarks') layers.push(...landmarkLayers(timeline, step, advanced));

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
        getLineColor: timeline.expandedSide[step] ? colorB : color,
        getLineWidth: 3,
        lineWidthUnits: 'pixels',
      }),
    );
  }

  if (route && step >= timeline.steps) {
    const [fromA, toB] = route;
    const path = {
      getPath: (d: { path: [number, number][] }) => d.path,
      widthUnits: 'pixels' as const,
      capRounded: true,
      jointRounded: true,
    };
    layers.push(
      new PathLayer({
        ...path,
        id: 'route-casing',
        data: toB ? [...fromA, ...toB] : fromA,
        getColor: [9, 12, 16],
        getWidth: 10,
      }),
      new PathLayer({ ...path, id: 'route', data: fromA, getColor: color, getWidth: 6 }),
    );
    if (toB) {
      layers.push(
        new PathLayer({ ...path, id: 'route-b', data: toB, getColor: colorB, getWidth: 6 }),
      );
    }
  }

  const meeting = both ? meetingAt(timeline, step) : -1;
  if (meeting >= 0) {
    const data = [
      {
        position: [timeline.meetPosition[2 * meeting]!, timeline.meetPosition[2 * meeting + 1]!],
        label: meetLabel?.(meeting) ?? '',
      },
    ];
    layers.push(
      new IconLayer<(typeof data)[number]>({
        id: 'meeting',
        data,
        getPosition: (d) => d.position as [number, number],
        getIcon: () => ({ id: 'diamond', url: DIAMOND, width: 24, height: 24 }),
        getSize: 22,
        sizeUnits: 'pixels',
      }),
    );
    if (meetLabel) {
      layers.push(
        new TextLayer<(typeof data)[number]>({
          id: 'meeting-label',
          data,
          getPosition: (d) => d.position as [number, number],
          getText: (d) => d.label,
          getSize: 12,
          getColor: [255, 255, 255],
          getTextAnchor: 'start',
          getAlignmentBaseline: 'center',
          getPixelOffset: [18, 0],
          fontFamily: 'IBM Plex Mono, monospace',
          characterSet: 'auto',
          background: true,
          getBackgroundColor: [21, 26, 33, 240],
          getBorderColor: [255, 255, 255, 200],
          getBorderWidth: 1,
          backgroundPadding: [8, 4],
        }),
      );
    }
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
