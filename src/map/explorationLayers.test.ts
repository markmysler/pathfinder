import { NEVER } from '../playback/timeline';
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

  it('reuses uploaded buffers between steps', () => {
    expect(byId(2)['explored-roads']!.props.data).toBe(byId(5)['explored-roads']!.props.data);
  });
});
