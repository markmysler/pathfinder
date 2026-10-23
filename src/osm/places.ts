import type { RoadNetwork } from './network';

/** A readable name for every node: the streets that meet there, like "Avenida de Mayo & Perú". */
export interface NodeLabels {
  /** Each distinct label once. */
  labels: string[];
  /** Index into `labels` per node, or -1 when no named street touches it. */
  nodeLabel: Int32Array;
}

const UNNAMED = 'Unnamed road';

export function nodeLabels(network: RoadNetwork): NodeLabels {
  const names: Set<string>[] = Array.from({ length: network.nodeCount }, () => new Set());
  for (let s = 0; s < network.segmentCount; s++) {
    const name = network.wayTags[network.segmentWay[s]!]!.name;
    if (!name) continue;
    names[network.segmentFrom[s]!]!.add(name);
    names[network.segmentTo[s]!]!.add(name);
  }
  const labels: string[] = [];
  const index = new Map<string, number>();
  const nodeLabel = new Int32Array(network.nodeCount).fill(-1);
  names.forEach((set, node) => {
    if (set.size === 0) return;
    // Two streets are enough to find a corner; sorting keeps the label the same every time.
    const label = [...set]
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 2)
      .join(' & ');
    let i = index.get(label);
    if (i === undefined) {
      i = labels.push(label) - 1;
      index.set(label, i);
    }
    nodeLabel[node] = i;
  });
  return { labels, nodeLabel };
}

export const labelOf = ({ labels, nodeLabel }: NodeLabels, node: number) =>
  labels[nodeLabel[node] ?? -1] ?? UNNAMED;
