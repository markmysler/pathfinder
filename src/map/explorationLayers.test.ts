import { meetingAt, NEVER } from '../playback/timeline';
import { fakeJobResult } from '../test/fakes';
import { explorationLayers, hexToRgb } from './explorationLayers';

const { timeline } = fakeJobResult('astar').runs[0]!;
const color = hexToRgb('#B197FC');
/** Layer props, including those the DataFilterExtension adds. */
const propsOf = (layer: { props: unknown }) => layer.props as Record<string, unknown>;
const byId = (step: number) =>
  Object.fromEntries(explorationLayers(timeline, step, color).map((layer) => [layer.id, layer]));

describe('hexToRgb', () => {
  it('turns a hex colour into RGB channels', () => {
    expect(hexToRgb('#B197FC')).toEqual([177, 151, 252]);
    expect(hexToRgb('#0e1116')).toEqual([14, 17, 22]);
  });
});

describe('explorationLayers', () => {
  it('uploads every explored road once and filters them by step', () => {
    const roads = byId(3)['explored-roads']!;
    expect((roads.props.data as { length: number }).length).toBe(timeline.roadCount);
    expect(propsOf(roads).filterRange).toEqual([0, 3]);
    expect(propsOf(byId(7)['explored-roads']!).filterRange).toEqual([0, 7]);
  });

  it('shows frontier nodes that entered by this step and have not left yet', () => {
    const frontier = byId(3)['frontier']!;
    expect((frontier.props.data as { length: number }).length).toBe(timeline.frontierCount);
    expect(propsOf(frontier).filterRange).toEqual([
      [0, 3],
      [3.5, NEVER + 1],
    ]);
  });

  it('marks the node being expanded while searching', () => {
    const head = byId(3)['expanding']!;
    expect(head.props.data).toEqual([
      { position: [timeline.expandedPosition[6], timeline.expandedPosition[7]] },
    ]);
    expect(byId(0)['expanding']).toBeUndefined();
    expect(byId(timeline.steps)['expanding']).toBeUndefined();
  });

  it('draws the route only once the search has finished', () => {
    expect(byId(timeline.steps - 1)['route']).toBeUndefined();
    const route = byId(timeline.steps)['route']!;
    const [drawn] = route.props.data as { path: number[][] }[];
    expect(drawn!.path).toHaveLength(timeline.route!.positions.length / 2);
    expect(byId(timeline.steps)['route-casing']).toBeDefined();
  });

  it('links where A and B were placed to the road nodes the search used', () => {
    const snaps = [
      { from: [1, 2], to: [3, 4] },
      { from: [5, 6], to: [7, 8] },
    ] as const;
    const links = Object.fromEntries(
      explorationLayers(timeline, 3, color, snaps).map((layer) => [layer.id, layer]),
    )['snap-links']!;
    expect(links.props.data).toEqual(snaps);
    expect(byId(3)['snap-links']).toBeUndefined();
  });

  it('rings a node picked from the frontier list, so it can be found on the map', () => {
    const layers = explorationLayers(timeline, 3, color, [], [-58.37, -34.6]);
    const ring = layers.find((layer) => layer.id === 'highlight')!;
    expect(propsOf(ring).data).toEqual([{ position: [-58.37, -34.6] }]);
    expect(byId(3)['highlight']).toBeUndefined();
  });

  it('reuses uploaded buffers between steps', () => {
    expect(byId(2)['explored-roads']!.props.data).toBe(byId(5)['explored-roads']!.props.data);
  });
});

describe('explorationLayers for a search from both ends', () => {
  const t = fakeJobResult('bidijkstra').runs[0]!.timeline;
  const colors = [hexToRgb('#2FC59A'), hexToRgb('#8DDFC7')] as const;
  const layersAt = (step: number) =>
    Object.fromEntries(
      explorationLayers(t, step, colors, [], null, (m) => `Met · ${m}`).map((layer) => [
        layer.id,
        layer,
      ]),
    );
  const count = (side: number, of: Uint8Array) => of.filter((s) => s === side).length;
  const met = t.meetStep[0]!;

  it("draws each side's roads and frontier in its own colour", () => {
    const layers = layersAt(2);
    expect((layers['explored-roads']!.props.data as { length: number }).length).toBe(
      count(0, t.roadSide),
    );
    expect((layers['explored-roads-b']!.props.data as { length: number }).length).toBe(
      count(1, t.roadSide),
    );
    expect(propsOf(layers['explored-roads-b']!).getColor).toEqual([...colors[1], 170]);
    expect((layers['frontier-b']!.props.data as { length: number }).length).toBe(
      count(1, t.frontierSide),
    );
    // From A filled dots, from B rings, like the A and B pins.
    expect(propsOf(layers['frontier']!).filled).not.toBe(false);
    expect(propsOf(layers['frontier-b']!)).toMatchObject({ filled: false, stroked: true });
  });

  it('colours the node being expanded by the side expanding it', () => {
    const step = [...t.expandedSide].findIndex((side, s) => s > 0 && side === 1);
    expect(propsOf(layersAt(step)['expanding']!).getLineColor).toEqual(colors[1]);
  });

  it('marks the best meeting point once the sides have met, with its label', () => {
    expect(layersAt(met - 1)['meeting']).toBeUndefined();
    const at = layersAt(met);
    // Several meetings can be found in one step; the latest is the best.
    const m = meetingAt(t, met);
    expect(propsOf(at['meeting']!).data).toEqual([
      { position: [t.meetPosition[2 * m], t.meetPosition[2 * m + 1]], label: `Met · ${m}` },
    ]);
    expect(at['meeting-label']).toBeDefined();
  });

  it('splits the route at the meeting point, each half in its side’s colour', () => {
    const at = layersAt(t.steps);
    const a = (at['route']!.props.data as { path: number[][] }[])[0]!.path;
    const b = (at['route-b']!.props.data as { path: number[][] }[])[0]!.path;
    const last = t.meetCount - 1;
    const meeting = [t.meetPosition[2 * last], t.meetPosition[2 * last + 1]];
    expect(a.at(-1)).toEqual(meeting);
    expect(b[0]).toEqual(meeting);
    expect(a.length + b.length - 1).toBe(t.route!.positions.length / 2);
    expect(propsOf(at['route-b']!).getColor).toEqual(colors[1]);
  });

  it('has no side-B layers for a one-way search', () => {
    expect(byId(3)['explored-roads-b']).toBeUndefined();
    expect(byId(3)['frontier-b']).toBeUndefined();
    expect(byId(timeline.steps)['route-b']).toBeUndefined();
  });
});
