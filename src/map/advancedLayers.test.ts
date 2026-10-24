import type { Layer } from '@deck.gl/core';
import { algorithms } from '../algorithms';
import { bellmanFordRounds } from '../playback/rounds';
import { fakeJobResult } from '../test/fakes';
import { hopsVsCost } from '../test/fixtures';
import { solve } from '../test/timelines';
import { contractionLayers } from './advancedLayers';
import { explorationLayers, hexToRgb } from './explorationLayers';

const propsOf = (layer: { props: unknown }) => layer.props as Record<string, unknown>;
const lengthOf = (layer: { props: { data?: unknown } }) =>
  (layer.props.data as { length: number }).length;
const ids = (layers: Layer[]): Record<string, Layer> =>
  Object.fromEntries(layers.map((l) => [l.id, l]));

describe('Bellman-Ford’s rounds on the map', () => {
  // Node 3 is reached in round 1, then corrected in round 3.
  const { timeline } = solve({ graph: hopsVsCost(), source: 0, target: 3 }, algorithms.bellmanford);
  const rounds = bellmanFordRounds(timeline, 3);
  const color = hexToRgb('#A3D95B');
  const at = (step: number) =>
    ids(
      explorationLayers(timeline, step, color, undefined, null, undefined, {
        kind: 'rounds',
        rounds,
      }),
    );

  it('brightens the roads explored in the current round over the earlier ones', () => {
    const step = rounds.startOf(1) + 1;
    const layers = at(step);
    expect(propsOf(layers['this-round']!).filterRange).toEqual([rounds.startOf(1), step]);
    expect(propsOf(layers['explored-roads']!).filterRange).toEqual([0, step]);
  });

  it('rings the nodes corrected in the current round', () => {
    const corrections = [...rounds.previousExpansion].filter((p) => p > 0).length;
    expect(corrections).toBeGreaterThan(0);
    const step = timeline.steps;
    const corrected = at(step)['corrected']!;
    expect(lengthOf(corrected)).toBe(corrections);
    expect(propsOf(corrected).filterRange).toEqual([rounds.startOf(rounds.roundAt[step]!), step]);
  });
});

describe('ALT’s landmarks on the map', () => {
  const result = fakeJobResult('alt');
  const run = result.runs[0]!;
  const landmarks = result.preparation.landmarks!;
  const at = (step: number) =>
    ids(
      explorationLayers(run.timeline, step, hexToRgb('#D57BF0'), undefined, null, undefined, {
        kind: 'landmarks',
        landmarks,
        steps: run.landmarkSteps,
      }),
    );

  it('draws every landmark, numbered in the order chosen', () => {
    const layers = at(1);
    expect(lengthOf(layers['landmarks']!)).toBe(landmarks.node.length);
    const labels = (layers['landmark-numbers']!.props.data as { label: string }[]).map(
      (d) => d.label,
    );
    expect(labels).toEqual(
      landmarks.node.length ? [...landmarks.node].map((_, i) => `${i + 1}`) : [],
    );
  });

  it('picks out the landmark behind the estimate now, with a line to it', () => {
    const step = [...run.landmarkSteps!.best].findIndex((b, s) => s > 0 && b >= 0);
    expect(step).toBeGreaterThan(0);
    const layers = at(step);
    const best = run.landmarkSteps!.best[step]!;
    const [picked] = layers['landmark-best']!.props.data as { index: number }[];
    expect(picked!.index).toBe(best);
    expect(layers['landmark-bound']).toBeDefined();
  });

  it('at the end picks out the landmark that gave most estimates, without the line', () => {
    const layers = at(run.timeline.steps);
    const [picked] = layers['landmark-best']!.props.data as { index: number }[];
    expect(picked!.index).toBe(run.landmarkSteps!.mostUsed);
    expect(layers['landmark-bound']).toBeUndefined();
  });
});

describe('contraction hierarchies’ most important nodes', () => {
  it('marks them while it climbs', () => {
    const result = fakeJobResult('ch');
    const replay = result.preparation.hierarchy!.replay;
    const layers = ids(
      explorationLayers(
        result.runs[0]!.timeline,
        2,
        hexToRgb('#F3E3C6'),
        undefined,
        null,
        undefined,
        {
          kind: 'hierarchy',
          replay,
        },
      ),
    );
    expect(lengthOf(layers['important']!)).toBe(replay.steps - replay.importantFrom);
  });
});

describe('contractionLayers', () => {
  const replay = fakeJobResult('ch').preparation.hierarchy!.replay;
  const at = (step: number) => ids(contractionLayers(replay, step));

  it('shows the nodes not contracted yet, the most important ones apart', () => {
    const layers = at(5);
    expect(lengthOf(layers['remaining']!) + lengthOf(layers['remaining-important']!)).toBe(
      replay.steps,
    );
    expect(propsOf(layers['remaining']!).filterRange).toEqual([5.5, replay.steps + 1]);
  });

  it('shows the shortcuts made so far, the newest brighter', () => {
    const step = replay.steps - 2;
    const layers = at(step);
    expect(lengthOf(layers['shortcuts']!)).toBe(replay.shortcutCount);
    expect(propsOf(layers['shortcuts']!).filterRange).toEqual([0, step]);
    const [from] = propsOf(layers['shortcuts-new']!).filterRange as number[];
    expect(from).toBeLessThanOrEqual(step);
  });

  it('rings the node being contracted', () => {
    const ring = at(3)['contracting']!;
    expect(ring.props.data).toEqual([{ position: [replay.position[4], replay.position[5]] }]);
    expect(at(0)['contracting']).toBeUndefined();
  });
});
