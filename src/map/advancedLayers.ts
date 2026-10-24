import type { Layer } from '@deck.gl/core';
import { DataFilterExtension, PathStyleExtension } from '@deck.gl/extensions';
import { IconLayer, LineLayer, PathLayer, ScatterplotLayer, TextLayer } from '@deck.gl/layers';
import type { Rounds } from '../playback/rounds';
import type { Timeline } from '../playback/timeline';
import { ALGORITHM_STYLE } from '../ui/algorithmStyle';
import type { ContractionReplay, LandmarkSteps, LandmarkView } from '../worker/preparations';
import { hexToRgb, type Rgb } from './hexToRgb';

/** What an advanced algorithm adds to the map of its search. */
export type AdvancedView =
  /** Bellman-Ford: the current round apart from earlier ones, and the nodes it corrected. */
  | { kind: 'rounds'; rounds: Rounds }
  /** ALT: its landmarks, and the one behind the estimate at each step. */
  | { kind: 'landmarks'; landmarks: LandmarkView; steps?: LandmarkSteps }
  /** Contraction hierarchies: the most important nodes, where climbs end up. */
  | { kind: 'hierarchy'; replay: ContractionReplay };

const filterByStep = new DataFilterExtension({ filterSize: 1 });
const dashed = new PathStyleExtension({ dash: true });

interface BinaryData {
  length: number;
  attributes: Record<string, { value: Float32Array; size: number }>;
}

/** The map's own background, for filling rings so they read over explored roads. */
const GROUND: Rgb = [18, 22, 28];
const WHITE: Rgb = [255, 255, 255];

// Built once per timeline, like the search's own buffers.
const corrections = new WeakMap<Timeline, BinaryData>();

/** Where each correction happened, stamped with its step: nodes expanded again, cheaper. */
function correctionsOf(timeline: Timeline, rounds: Rounds): BinaryData {
  let data = corrections.get(timeline);
  if (data) return data;
  const steps: number[] = [];
  for (let step = 1; step <= timeline.steps; step++) {
    if (rounds.previousExpansion[step]! > 0) steps.push(step);
  }
  const position = new Float32Array(2 * steps.length);
  const stamp = new Float32Array(steps.length);
  steps.forEach((step, i) => {
    position[2 * i] = timeline.expandedPosition[2 * step]!;
    position[2 * i + 1] = timeline.expandedPosition[2 * step + 1]!;
    stamp[i] = step;
  });
  data = {
    length: steps.length,
    attributes: {
      getPosition: { value: position, size: 2 },
      getFilterValue: { value: stamp, size: 1 },
    },
  };
  corrections.set(timeline, data);
  return data;
}

/**
 * The current round in full colour over the dimmed earlier ones, and rings on the nodes this
 * round corrected. `roads` is the explored roads' data, shared with the search's own layer.
 */
export function roundLayers(
  timeline: Timeline,
  step: number,
  rounds: Rounds,
  roads: BinaryData,
  color: Rgb,
): Layer[] {
  const from = rounds.startOf(rounds.roundAt[step]!);
  return [
    new LineLayer({
      id: 'this-round',
      data: roads,
      getColor: [...color, 255],
      getWidth: 2.5,
      widthUnits: 'pixels',
      extensions: [filterByStep],
      filterRange: [from, step],
    } as never),
    new ScatterplotLayer({
      id: 'corrected',
      data: correctionsOf(timeline, rounds),
      getRadius: 4.5,
      radiusUnits: 'pixels',
      stroked: true,
      getFillColor: GROUND,
      getLineColor: color,
      getLineWidth: 2,
      lineWidthUnits: 'pixels',
      extensions: [filterByStep],
      filterRange: [from, step],
    } as never),
  ];
}

/** A diamond, as landmarks are drawn everywhere else. */
const diamond = (fill: string, stroke: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' +
      `<path d="M16 2l14 14-14 14L2 16z" fill="${fill}" stroke="${stroke}" stroke-width="2.5" ` +
      'stroke-linejoin="round"/></svg>',
  )}`;

interface Landmark {
  index: number;
  position: [number, number];
  label: string;
}

export function landmarkLayers(
  timeline: Timeline,
  step: number,
  { landmarks, steps }: Extract<AdvancedView, { kind: 'landmarks' }>,
): Layer[] {
  const color = ALGORITHM_STYLE.alt.color;
  const all: Landmark[] = Array.from(landmarks.node, (_, index) => ({
    index,
    position: [landmarks.position[2 * index]!, landmarks.position[2 * index + 1]!],
    label: `${index + 1}`,
  }));
  // While searching, the landmark behind the estimate; at the end, the one used most.
  const searching = step > 0 && step < timeline.steps;
  const best = steps ? (searching ? steps.best[step]! : steps.mostUsed) : -1;
  const picked = all.filter((landmark) => landmark.index === best);
  const icon = (id: string, url: string) => () => ({ id, url, width: 32, height: 32 });
  const layers: Layer[] = [];
  if (searching && picked.length) {
    const here: [number, number] = [
      timeline.expandedPosition[2 * step]!,
      timeline.expandedPosition[2 * step + 1]!,
    ];
    layers.push(
      new PathLayer({
        id: 'landmark-bound',
        data: [{ path: [here, picked[0]!.position] }],
        getPath: (d: { path: [number, number][] }) => d.path,
        getColor: [...hexToRgb(color), 255],
        getWidth: 2,
        widthUnits: 'pixels',
        getDashArray: [6, 6],
        dashJustified: true,
        extensions: [dashed],
      } as never),
    );
  }
  layers.push(
    new IconLayer<Landmark>({
      id: 'landmarks',
      data: all,
      getPosition: (d) => d.position,
      getIcon: icon('landmark', diamond('#151A21', color)),
      getSize: 30,
      sizeUnits: 'pixels',
    }),
    new IconLayer<Landmark>({
      id: 'landmark-best',
      data: picked,
      getPosition: (d) => d.position,
      getIcon: icon('landmark-best', diamond(color, '#FFFFFF')),
      getSize: 30,
      sizeUnits: 'pixels',
    }),
    new TextLayer<Landmark>({
      id: 'landmark-numbers',
      data: all,
      getPosition: (d) => d.position,
      getText: (d) => d.label,
      getSize: 13,
      getColor: (d) => (d.index === best ? [14, 17, 22] : [232, 236, 241]),
      updateTriggers: { getColor: best },
      fontFamily: 'IBM Plex Mono, monospace',
      fontWeight: 600,
      getTextAnchor: 'middle',
      getAlignmentBaseline: 'center',
    }),
  );
  return layers;
}

// The positions of the most important nodes, per replay.
const important = new WeakMap<ContractionReplay, Float32Array>();

/** The nodes contracted last: where every climb heads, so where the two sides meet. */
export function importantLayer({ replay }: Extract<AdvancedView, { kind: 'hierarchy' }>): Layer {
  let positions = important.get(replay);
  if (!positions) {
    positions = Float32Array.from(replay.position.subarray(2 * replay.importantFrom));
    important.set(replay, positions);
  }
  return new ScatterplotLayer({
    id: 'important',
    data: {
      length: positions.length / 2,
      attributes: { getPosition: { value: positions, size: 2 } },
    },
    getFillColor: [...hexToRgb(ALGORITHM_STYLE.ch.colorA!), 200],
    getRadius: 3,
    radiusUnits: 'pixels',
  } as never);
}

interface ReplayBuffers {
  remaining: [BinaryData, BinaryData];
  shortcuts: BinaryData;
}

const replayBuffers = new WeakMap<ContractionReplay, ReplayBuffers>();

function buffersOf(replay: ContractionReplay): ReplayBuffers {
  let buffers = replayBuffers.get(replay);
  if (buffers) return buffers;
  // Each node is stamped with the step that contracts it, and shows until then.
  const part = (from: number, to: number): BinaryData => {
    const position = Float32Array.from(replay.position.subarray(2 * from, 2 * to));
    const stamp = Float32Array.from({ length: to - from }, (_, i) => from + i + 1);
    return {
      length: to - from,
      attributes: {
        getPosition: { value: position, size: 2 },
        getFilterValue: { value: stamp, size: 1 },
      },
    };
  };
  const from = new Float32Array(2 * replay.shortcutCount);
  const to = new Float32Array(2 * replay.shortcutCount);
  for (let i = 0; i < replay.shortcutCount; i++) {
    from.set(replay.shortcutPosition.subarray(4 * i, 4 * i + 2), 2 * i);
    to.set(replay.shortcutPosition.subarray(4 * i + 2, 4 * i + 4), 2 * i);
  }
  buffers = {
    remaining: [part(0, replay.importantFrom), part(replay.importantFrom, replay.steps)],
    shortcuts: {
      length: replay.shortcutCount,
      attributes: {
        getSourcePosition: { value: from, size: 2 },
        getTargetPosition: { value: to, size: 2 },
        getFilterValue: { value: replay.shortcutStep, size: 1 },
      },
    },
  };
  replayBuffers.set(replay, buffers);
  return buffers;
}

/**
 * Contraction at a step: the nodes still to go, shortcuts made so far with the newest bright,
 * and a ring on the node being taken out. Like a search, any step is just a filter.
 */
export function contractionLayers(replay: ContractionReplay, step: number): Layer[] {
  const { remaining, shortcuts } = buffersOf(replay);
  const gold = hexToRgb(ALGORITHM_STYLE.ch.colorA!);
  // Playback moves many steps a frame, so "new" spans the last half percent of them.
  const recent = Math.max(1, Math.round(replay.steps / 200));
  const left = [step + 0.5, replay.steps + 1];
  const layers: Layer[] = [
    new ScatterplotLayer({
      id: 'remaining',
      data: remaining[0],
      getFillColor: [92, 107, 122],
      getRadius: 2,
      radiusUnits: 'pixels',
      extensions: [filterByStep],
      filterRange: left,
    } as never),
    new LineLayer({
      id: 'shortcuts',
      data: shortcuts,
      getColor: [...gold, 80],
      getWidth: 1.4,
      widthUnits: 'pixels',
      extensions: [filterByStep],
      filterRange: [0, step],
    } as never),
    new LineLayer({
      id: 'shortcuts-new',
      data: shortcuts,
      getColor: [...gold, 255],
      getWidth: 2.4,
      widthUnits: 'pixels',
      extensions: [filterByStep],
      filterRange: [Math.max(0, step - recent + 0.5), step],
    } as never),
    new ScatterplotLayer({
      id: 'remaining-important',
      data: remaining[1],
      getFillColor: gold,
      getRadius: 3.5,
      radiusUnits: 'pixels',
      extensions: [filterByStep],
      filterRange: left,
    } as never),
  ];
  if (step > 0 && step <= replay.steps) {
    layers.push(
      new ScatterplotLayer<{ position: [number, number] }>({
        id: 'contracting',
        data: [{ position: [replay.position[2 * (step - 1)]!, replay.position[2 * step - 1]!] }],
        getPosition: (d) => d.position,
        getRadius: 9,
        radiusUnits: 'pixels',
        filled: false,
        stroked: true,
        getLineColor: WHITE,
        getLineWidth: 2.5,
        lineWidthUnits: 'pixels',
      }),
    );
  }
  return layers;
}
