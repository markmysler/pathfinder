import { liveTraffic } from '../test/traffic';
import { trafficLayers } from './trafficLayers';

const live = liveTraffic();
const byId = (options: Parameters<typeof trafficLayers>[1]) =>
  Object.fromEntries(trafficLayers(live, options).map((layer) => [layer.id, layer]));
const lengthOf = (layer: { props: { data: unknown } }) =>
  (layer.props.data as { length: number }).length;

describe('trafficLayers', () => {
  it('draws slow and jammed roads as bands, and closed roads dashed', () => {
    const layers = byId({ bands: true, finished: false });
    // The fixture has one jammed road (18%) and one closed one.
    expect(lengthOf(layers['traffic-bands']!)).toBe(1);
    expect(lengthOf(layers['traffic-closed']!)).toBe(1);
    const [jammed] = layers['traffic-bands']!.props.data as { path: number[][]; share: number }[];
    expect(jammed!.path).toEqual([
      [0, 0],
      [0.001, 0],
    ]);
    const color = (layers['traffic-bands']!.props as unknown as { getColor(d: unknown): number[] })
      .getColor;
    // Jammed roads are drawn stronger than slow ones.
    expect(color({ share: 0.18 })[0]).toBeGreaterThan(color({ share: 0.6 })[0]!);
  });

  it('hides the bands when the layer is switched off', () => {
    const layers = byId({ bands: false, finished: true });
    expect(layers['traffic-bands']).toBeUndefined();
    expect(layers['traffic-closed']).toBeUndefined();
  });

  it('draws the best route without traffic, dotted, once the search has finished', () => {
    expect(byId({ bands: true, finished: false })['clear-route']).toBeUndefined();
    const clear = byId({ bands: false, finished: true })['clear-route']!;
    expect(clear.props.data).toEqual([
      {
        path: [
          [0, 0],
          [0.002, 0.002],
        ],
      },
    ]);
  });

  it('leaves out the route without traffic when traffic did not move it', () => {
    const same = liveTraffic();
    same.story = { ...same.story, changed: false };
    const layers = trafficLayers(same, { bands: true, finished: true });
    expect(layers.map((layer) => layer.id)).not.toContain('clear-route');
  });
});
