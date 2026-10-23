import type { Graph } from './graph';

/**
 * Marks (with 1) the nodes of the graph's largest strongly connected component: the biggest set
 * of nodes that can all reach one another. Searching only between such nodes guarantees a route
 * exists, e.g. it keeps a car from starting at the end of a one-way street it can never leave.
 *
 * Kosaraju's algorithm, written iteratively so large road networks cannot overflow the stack.
 */
export function largestStronglyConnectedComponent(graph: Graph): Uint8Array {
  const n = graph.nodeCount;
  const mask = new Uint8Array(n);
  if (n === 0) return mask;

  // Pass 1: depth-first over the graph, recording nodes in the order they finish.
  const finished = new Int32Array(n);
  let finishedCount = 0;
  const visited = new Uint8Array(n);
  const stackNode = new Int32Array(n);
  const stackEdge = new Int32Array(n);
  for (let root = 0; root < n; root++) {
    if (visited[root]) continue;
    visited[root] = 1;
    let top = 0;
    stackNode[0] = root;
    stackEdge[0] = graph.firstEdge[root]!;
    while (top >= 0) {
      const node = stackNode[top]!;
      const edge = stackEdge[top]!;
      if (edge < graph.firstEdge[node + 1]!) {
        stackEdge[top] = edge + 1;
        const next = graph.edgeTarget[edge]!;
        if (!visited[next]) {
          visited[next] = 1;
          top++;
          stackNode[top] = next;
          stackEdge[top] = graph.firstEdge[next]!;
        }
      } else {
        finished[finishedCount++] = node;
        top--;
      }
    }
  }

  // Pass 2: over the reversed graph, latest finisher first; each sweep is one component.
  const { firstEdge, edgeTarget } = reverseEdges(graph);
  const component = new Int32Array(n).fill(-1);
  const stack = new Int32Array(n);
  let largest = -1;
  let largestSize = 0;
  let components = 0;
  for (let i = n - 1; i >= 0; i--) {
    const root = finished[i]!;
    if (component[root] !== -1) continue;
    component[root] = components;
    let size = 0;
    let top = 0;
    stack[0] = root;
    while (top >= 0) {
      const node = stack[top--]!;
      size++;
      for (let e = firstEdge[node]!; e < firstEdge[node + 1]!; e++) {
        const next = edgeTarget[e]!;
        if (component[next] === -1) {
          component[next] = components;
          stack[++top] = next;
        }
      }
    }
    if (size > largestSize) {
      largest = components;
      largestSize = size;
    }
    components++;
  }

  for (let node = 0; node < n; node++) mask[node] = component[node] === largest ? 1 : 0;
  return mask;
}

/** The graph's edges flipped, in the same CSR layout. */
function reverseEdges(graph: Graph) {
  const firstEdge = new Uint32Array(graph.nodeCount + 1);
  for (let e = 0; e < graph.edgeCount; e++) firstEdge[graph.edgeTarget[e]! + 1]!++;
  for (let n = 0; n < graph.nodeCount; n++) firstEdge[n + 1]! += firstEdge[n]!;
  const nextSlot = firstEdge.slice(0, graph.nodeCount);
  const edgeTarget = new Uint32Array(graph.edgeCount);
  for (let e = 0; e < graph.edgeCount; e++) {
    edgeTarget[nextSlot[graph.edgeTarget[e]!]!++] = graph.edgeSource[e]!;
  }
  return { firstEdge, edgeTarget };
}
