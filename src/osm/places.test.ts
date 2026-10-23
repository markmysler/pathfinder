import plazaDeMayo from './fixtures/plaza-de-mayo.overpass.json';
import { buildRoadNetwork, type OverpassResponse } from './network';
import { labelOf, nodeLabels } from './places';

describe('nodeLabels', () => {
  it('names a node after the streets that meet there', () => {
    const network = buildRoadNetwork({
      elements: [
        { type: 'node', id: 1, lat: 0, lon: 0 },
        { type: 'node', id: 2, lat: 0, lon: 0.001 },
        { type: 'node', id: 3, lat: 0, lon: 0.002 },
        { type: 'node', id: 4, lat: 0.001, lon: 0.001 },
        { type: 'node', id: 5, lat: 0.002, lon: 0.001 },
        { type: 'way', id: 10, nodes: [1, 2, 3], tags: { highway: 'residential', name: 'Perú' } },
        {
          type: 'way',
          id: 11,
          nodes: [2, 4],
          tags: { highway: 'primary', name: 'Avenida de Mayo' },
        },
        { type: 'way', id: 12, nodes: [4, 5], tags: { highway: 'footway' } },
      ],
    });
    const labels = nodeLabels(network);
    const at = (osmId: number) => labelOf(labels, network.osmId.indexOf(osmId));
    expect(at(1)).toBe('Perú');
    expect(at(2)).toBe('Avenida de Mayo & Perú');
    expect(at(4)).toBe('Avenida de Mayo');
    expect(at(5)).toBe('Unnamed road');
  });

  it('shares one entry per distinct name, and names real corners', () => {
    const network = buildRoadNetwork(plazaDeMayo as unknown as OverpassResponse);
    const labels = nodeLabels(network);
    expect(labels.nodeLabel).toHaveLength(network.nodeCount);
    expect(new Set(labels.labels).size).toBe(labels.labels.length);
    expect(labels.labels).toContain('Avenida de Mayo & Bolívar');
  });
});
