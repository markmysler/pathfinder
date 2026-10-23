/**
 * Tiny road networks for the step-through diagrams. Each node has a guessed distance to T (h)
 * and a place in two layouts: wide for desktop, tall for phones. Edges are two-way, listed in
 * the order each node meets them, which decides ties and the road DFS tries first.
 */
export interface DiagramNode {
  id: string;
  h: number;
  wide: readonly [number, number];
  tall: readonly [number, number];
}

export interface DiagramNetwork {
  nodes: DiagramNode[];
  edges: readonly (readonly [string, string, number])[];
  source: string;
  target: string;
}

/** Two ways from S to T that cost 6 and 7, with a sense of direction to help A*. */
export const SIX: DiagramNetwork = {
  nodes: [
    { id: 'S', h: 5, wide: [108, 106], tall: [70, 48] },
    { id: 'A', h: 4, wide: [360, 106], tall: [70, 188] },
    { id: 'B', h: 1, wide: [612, 106], tall: [70, 328] },
    { id: 'C', h: 5, wide: [108, 286], tall: [256, 48] },
    { id: 'D', h: 3, wide: [360, 286], tall: [256, 188] },
    { id: 'T', h: 0, wide: [612, 286], tall: [256, 328] },
  ],
  edges: [
    ['S', 'C', 2],
    ['S', 'A', 2],
    ['C', 'D', 2],
    ['D', 'A', 4],
    ['D', 'T', 3],
    ['A', 'B', 3],
    ['B', 'T', 1],
  ],
  source: 'S',
  target: 'T',
};

/** One expensive road straight to T, and three cheap ones around: BFS counts roads, not cost. */
export const HOPS: DiagramNetwork = {
  nodes: [
    { id: 'S', h: 3, wide: [108, 286], tall: [70, 48] },
    { id: 'A', h: 2, wide: [250, 96], tall: [256, 128] },
    { id: 'B', h: 1, wide: [470, 96], tall: [256, 248] },
    { id: 'T', h: 0, wide: [612, 286], tall: [70, 328] },
  ],
  edges: [
    ['S', 'T', 9],
    ['S', 'A', 1],
    ['A', 'B', 1],
    ['B', 'T', 1],
  ],
  source: 'S',
  target: 'T',
};

/** A looks close to T, but the only road from A to T is a long detour. */
export const DETOUR: DiagramNetwork = {
  nodes: [
    { id: 'S', h: 4, wide: [108, 196], tall: [163, 48] },
    { id: 'A', h: 1, wide: [360, 86], tall: [70, 188] },
    { id: 'B', h: 3, wide: [360, 306], tall: [256, 188] },
    { id: 'T', h: 0, wide: [612, 196], tall: [163, 328] },
  ],
  edges: [
    ['S', 'A', 1],
    ['S', 'B', 3],
    ['A', 'T', 10],
    ['B', 'T', 3],
  ],
  source: 'S',
  target: 'T',
};

/**
 * Two ways from S to T: up through P costs 11, round the bottom through Q and R costs 6. A search
 * from both ends meets at P first, and must not stop there.
 */
export const TRAP: DiagramNetwork = {
  nodes: [
    { id: 'S', h: 6, wide: [110, 150], tall: [163, 40] },
    { id: 'P', h: 5, wide: [360, 60], tall: [262, 200] },
    { id: 'Q', h: 4, wide: [260, 250], tall: [64, 150] },
    { id: 'R', h: 2, wide: [460, 250], tall: [64, 262] },
    { id: 'T', h: 0, wide: [610, 150], tall: [163, 370] },
  ],
  edges: [
    ['S', 'P', 1],
    ['P', 'T', 10],
    ['S', 'Q', 2],
    ['Q', 'R', 2],
    ['R', 'T', 2],
  ],
  source: 'S',
  target: 'T',
};
