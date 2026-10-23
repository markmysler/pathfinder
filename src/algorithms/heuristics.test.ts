import fc from 'fast-check';
import { haversineMeters } from '../graph/geo';
import { randomGeoProblem } from '../test/arbitraries';
import { grid } from '../test/fixtures';
import { referenceDistances } from '../test/reference';
import { straightLineHeuristic, zeroHeuristic } from './heuristics';

describe('zeroHeuristic', () => {
  it('estimates zero everywhere', () => {
    expect(zeroHeuristic(0)).toBe(0);
    expect(zeroHeuristic(42)).toBe(0);
  });
});

describe('straightLineHeuristic', () => {
  const graph = grid(3);
  const target = 8;

  it('is zero at the target', () => {
    expect(straightLineHeuristic(graph, target)(target)).toBe(0);
  });

  it('is the straight-line distance to the target in meters by default', () => {
    const h = straightLineHeuristic(graph, target);
    expect(h(0)).toBe(haversineMeters(graph.lat[0]!, graph.lon[0]!, graph.lat[8]!, graph.lon[8]!));
  });

  it('divides by the maximum speed when weights are travel times', () => {
    const inMeters = straightLineHeuristic(graph, target);
    const inSeconds = straightLineHeuristic(graph, target, 25);
    expect(inSeconds(0)).toBeCloseTo(inMeters(0) / 25);
  });

  it('never overestimates the true remaining cost', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source, target }) => {
        const trueCost = referenceDistances(graph, source)[target]!;
        expect(straightLineHeuristic(graph, target)(source)).toBeLessThanOrEqual(trueCost + 1e-6);
      }),
    );
  });
});
