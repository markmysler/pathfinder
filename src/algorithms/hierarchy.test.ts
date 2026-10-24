import fc from 'fast-check';
import plazaDeMayo from '../osm/fixtures/plaza-de-mayo.overpass.json';
import { buildRoadNetwork, type OverpassResponse } from '../osm/network';
import { prepareSearch } from '../osm/prepare';
import { randomGeoProblem } from '../test/arbitraries';
import { undirectedGraphFrom } from '../test/fixtures';
import { referenceDistances } from '../test/reference';
import { bidirectionalDijkstra } from './bidirectional';
import { contract, contractionHierarchies, unpack } from './hierarchy';
import { runSearch, summarize } from './trace';

const shortcutsOf = (h: ReturnType<typeof contract>) =>
  Array.from({ length: h.edgeCount - h.baseEdgeCount }, (_, i) => h.baseEdgeCount + i);

describe('contract', () => {
  it('ranks every node once: the order is the order nodes were contracted in', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph }) => {
        const h = contract(graph);
        expect([...h.order].sort((a, b) => a - b)).toEqual([...Array(graph.nodeCount).keys()]);
        h.order.forEach((node, rank) => expect(h.rank[node]).toBe(rank));
      }),
    );
  });

  it('keeps the graph’s own edges first, under the same numbers', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph }) => {
        const h = contract(graph);
        expect(h.baseEdgeCount).toBe(graph.edgeCount);
        for (let e = 0; e < graph.edgeCount; e++) {
          expect([h.edgeFrom[e], h.edgeTo[e], h.edgeWeight[e]]).toEqual([
            graph.edgeSource[e],
            graph.edgeTarget[e],
            graph.edgeWeight[e],
          ]);
        }
      }),
    );
  });

  it('adds a shortcut when contracting a node would cut the only cheap way past it', () => {
    // 0 – 1 – 2, every road costing 1; contracting 1 first must keep 0 ↔ 2 at cost 2.
    const graph = undirectedGraphFrom([
      [0, 1, 1],
      [1, 2, 1],
    ]);
    const h = contract(graph, { order: [1, 0, 2] });
    const shortcuts = shortcutsOf(h).map((s) => [h.edgeFrom[s], h.edgeTo[s], h.edgeWeight[s]]);
    expect(shortcuts).toEqual([
      [0, 2, 2],
      [2, 0, 2],
    ]);
    for (const s of shortcutsOf(h)) expect(h.shortcutVia[s - h.baseEdgeCount]).toBe(1);
  });

  it('adds no shortcut when another way is as cheap: a witness', () => {
    const witnessed = undirectedGraphFrom([
      [0, 1, 1],
      [1, 2, 1],
      [0, 2, 2],
    ]);
    expect(shortcutsOf(contract(witnessed, { order: [1, 0, 2] }))).toEqual([]);
    const tooDear = undirectedGraphFrom([
      [0, 1, 1],
      [1, 2, 1],
      [0, 2, 3],
    ]);
    expect(shortcutsOf(contract(tooDear, { order: [1, 0, 2] }))).toHaveLength(2);
  });

  it('builds each shortcut from two edges that meet at a node contracted before both ends', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph }) => {
        const h = contract(graph);
        for (const s of shortcutsOf(h)) {
          const i = s - h.baseEdgeCount;
          const [first, second, via] = [
            h.shortcutFirst[i]!,
            h.shortcutSecond[i]!,
            h.shortcutVia[i]!,
          ];
          expect(h.edgeFrom[first]).toBe(h.edgeFrom[s]);
          expect(h.edgeTo[first]).toBe(via);
          expect(h.edgeFrom[second]).toBe(via);
          expect(h.edgeTo[second]).toBe(h.edgeTo[s]);
          expect(h.edgeWeight[s]).toBeCloseTo(h.edgeWeight[first]! + h.edgeWeight[second]!, 9);
          expect(h.rank[via]).toBeLessThan(h.rank[h.edgeFrom[s]!]!);
          expect(h.rank[via]).toBeLessThan(h.rank[h.edgeTo[s]!]!);
        }
      }),
    );
  });

  it('unpacks a shortcut into the graph’s own edges, in order', () => {
    const graph = undirectedGraphFrom([
      [0, 1, 1],
      [1, 2, 1],
      [2, 3, 1],
    ]);
    // Contracting 1 then 2 makes 0 → 2 (via 1), then 0 → 3 out of that and 2 → 3 (via 2).
    const h = contract(graph, { order: [1, 2, 0, 3] });
    const longest = shortcutsOf(h).find((s) => h.edgeFrom[s] === 0 && h.edgeTo[s] === 3)!;
    const edges = unpack(h, [longest]);
    expect(edges.map((e) => [graph.edgeSource[e], graph.edgeTarget[e]])).toEqual([
      [0, 1],
      [1, 2],
      [2, 3],
    ]);
  });

  it('lists every edge as going up from exactly one of its ends', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph }) => {
        const h = contract(graph);
        const seen = new Array<number>(h.edgeCount).fill(0);
        for (let n = 0; n < graph.nodeCount; n++) {
          for (let i = h.upFirst[n]!; i < h.upFirst[n + 1]!; i++) {
            const e = h.upEdge[i]!;
            expect(h.edgeFrom[e]).toBe(n);
            expect(h.rank[h.edgeTo[e]!]).toBeGreaterThan(h.rank[n]!);
            seen[e]!++;
          }
          for (let i = h.downFirst[n]!; i < h.downFirst[n + 1]!; i++) {
            const e = h.downEdge[i]!;
            expect(h.edgeTo[e]).toBe(n);
            expect(h.rank[h.edgeFrom[e]!]).toBeGreaterThan(h.rank[n]!);
            seen[e]!++;
          }
        }
        // Self-loops never help, so they go nowhere.
        seen.forEach((count, e) => expect(count).toBe(h.edgeFrom[e] === h.edgeTo[e] ? 0 : 1));
      }),
    );
  });
});

describe('contractionHierarchies', () => {
  it('finds a route exactly as cheap as the cheapest, between any two nodes', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source, target }) => {
        const hierarchy = contract(graph);
        const { result } = runSearch(contractionHierarchies, { graph, source, target, hierarchy });
        const cheapest = referenceDistances(graph, source)[target]!;
        expect(result.found).toBe(cheapest < Infinity);
        if (result.found) expect(result.cost).toBeCloseTo(cheapest, 6);
      }),
    );
  });

  it('only ever climbs: every road it explores leads to a more important node', () => {
    fc.assert(
      fc.property(randomGeoProblem(), ({ graph, source, target }) => {
        const hierarchy = contract(graph);
        const { events } = runSearch(contractionHierarchies, { graph, source, target, hierarchy });
        for (const event of events) {
          if (event.type !== 'push' || event.edge === null) continue;
          const [from, to] = [hierarchy.edgeFrom[event.edge]!, hierarchy.edgeTo[event.edge]!];
          const [lower, higher] = event.side === 'backward' ? [to, from] : [from, to];
          expect(event.node).toBe(higher);
          expect(hierarchy.rank[higher]).toBeGreaterThan(hierarchy.rank[lower]!);
        }
      }),
    );
  });

  it('expands far fewer nodes than bidirectional Dijkstra on real streets', () => {
    const network = buildRoadNetwork(plazaDeMayo as unknown as OverpassResponse);
    const prepared = prepareSearch(network, {
      start: { lat: -34.6057, lon: -58.3755 },
      target: { lat: -34.6115, lon: -58.3685 },
      mode: 'car',
      objective: 'fastest',
    });
    const hierarchy = contract(prepared.graph);
    const ch = runSearch(contractionHierarchies, { ...prepared, hierarchy });
    const both = runSearch(bidirectionalDijkstra, prepared);
    expect(ch.result).toMatchObject({ found: true });
    if (ch.result.found && both.result.found) {
      expect(ch.result.cost).toBeCloseTo(both.result.cost, 6);
    }
    expect(summarize(ch.events).expanded * 3).toBeLessThan(summarize(both.events).expanded);
  });
});
