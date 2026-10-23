import type { ReactNode } from 'react';
import { learnHref } from '../../app/routes';
import styles from '../Article.module.css';
import { ArticleHeader, ArticleNav, M, Section } from '../kit';
import { topic } from '../topics';

const TERMS: [string, ReactNode][] = [
  [
    'A* search',
    <>
      A best-first search that orders its frontier by <M>g + h</M>. Finds the cheapest route if{' '}
      <M>h</M> is admissible. <a href={learnHref('astar')}>Article</a>.
    </>,
  ],
  [
    'Adjacency list',
    'For each node, the list of edges that leave it. How graphs are usually stored for searching.',
  ],
  [
    'Admissible',
    <>
      A heuristic that never guesses more than the true remaining cost.{' '}
      <a href={learnHref('heuristics')}>Heuristics</a>.
    </>,
  ],
  [
    'Breadth-first search (BFS)',
    <>
      Expands nodes in the order they were reached, using a queue. Finds the route with the fewest
      edges. <a href={learnHref('bfs')}>Article</a>.
    </>,
  ],
  [
    'Consistent',
    <>
      A heuristic where <M>h(n) ≤ c + h(m)</M> for every edge from <M>n</M> to <M>m</M> costing{' '}
      <M>c</M>. Every consistent heuristic is admissible.
    </>,
  ],
  [
    'CSR (compressed sparse row)',
    'A compact layout for a graph: every edge in one array, grouped by the node it leaves, with a second array marking where each group starts.',
  ],
  [
    'Depth-first search (DFS)',
    <>
      Expands the most recently reached node first, using a stack.{' '}
      <a href={learnHref('dfs')}>Article</a>.
    </>,
  ],
  [
    'Dijkstra',
    <>
      A best-first search that orders its frontier by cost so far, <M>g</M>. Finds the cheapest
      route when no edge has a negative cost. <a href={learnHref('dijkstra')}>Article</a>.
    </>,
  ],
  ['Edge', 'A connection between two nodes: in Pathfinder, a stretch of road.'],
  [
    'Expand',
    'To take a node out of the frontier and look at its edges. Each step of playback is one expansion.',
  ],
  [
    'f',
    <>
      The total a best-first search orders by. In A*, <M>f = g + h</M>: the estimated cost of the
      best route through a node.
    </>,
  ],
  [
    'Frontier',
    <>
      The nodes that have been reached but not yet expanded.{' '}
      <a href={learnHref('frontier')}>Frontier, expanded and cost</a>.
    </>,
  ],
  ['g', 'The cost of the best route found so far from the start to a node.'],
  [
    'Graph',
    <>
      Nodes joined by edges. <a href={learnHref('graphs')}>What is a graph?</a>
    </>,
  ],
  [
    'Greedy best-first',
    <>
      Orders its frontier by the estimate <M>h</M> alone. Fast, not always good.{' '}
      <a href={learnHref('greedy')}>Article</a>.
    </>,
  ],
  ['h, heuristic', 'An estimate of the cost still to go from a node to the destination.'],
  ['Node', 'A point in a graph: in Pathfinder, an intersection or a bend in a road.'],
  [
    'Optimal',
    'Guaranteed to find the cheapest route. Dijkstra and A* (with an admissible heuristic) are; the others are not.',
  ],
  [
    'Outdated entry',
    'A frontier entry for a node that has since been reached more cheaply, or already expanded. It is skipped when it comes up.',
  ],
  [
    'Priority queue',
    'A collection that always hands back its smallest entry next. Pathfinder uses a binary heap.',
  ],
  ['Queue', 'First in, first out: the oldest entry comes out next.'],
  ['Relax', 'To check whether a road gives a cheaper way to its end, and lower its cost if so.'],
  ['Route', 'A path from the start to the destination; its cost is the sum of its edges.'],
  [
    'Snap',
    'To move a point dropped on the map to the nearest node of the road graph, where the search starts or ends.',
  ],
  ['Stack', 'Last in, first out: the newest entry comes out next.'],
  [
    'Strongly connected',
    'Every node can reach every other along the edges’ directions. Pathfinder searches the largest strongly connected part of the roads.',
  ],
  ['Weight', 'The cost of an edge: metres for the shortest route, seconds for the fastest.'],
  [
    'Weighted A*',
    <>
      A* with its estimate multiplied by a weight <M>w</M> above 1. Explores less; its route costs
      at most <M>w</M> times the cheapest.
    </>,
  ],
];

export default function GlossaryArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('glossary')}
        lede="Every term used on this site, in a sentence or two, with a link to where it is explained properly."
      />
      <Section id="terms" title="Terms">
        <dl className={styles.terms}>
          {TERMS.map(([term, meaning]) => (
            <div key={term}>
              <dt>{term}</dt>
              <dd>{meaning}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <ArticleNav slug="glossary" />
    </>
  );
}
