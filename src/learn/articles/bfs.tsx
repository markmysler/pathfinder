import { formatCost } from '../../ui/format';
import {
  ArticleHeader,
  ArticleNav,
  Callout,
  CodeBlock,
  FrontierStrip,
  Glance,
  M,
  Section,
  StreetsCompare,
} from '../kit';
import { topic } from '../topics';
import { HOPS } from '../networks';
import { StepDiagram } from '../StepDiagram';

export default function BfsArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('bfs')}
        watch="bfs"
        race="dijkstra"
        lede="Breadth-first search explores in rings: first every place one road away from the start, then every place two roads away, and so on. It finds the route with the fewest roads, which is not always the cheapest."
      />

      <Glance
        items={[
          ['Frontier', 'Queue: first in, first out'],
          ['Finds the cheapest route?', 'Only if every road costs the same'],
          ['Uses road costs?', 'No'],
          ['Uses an estimate?', 'No'],
          ['Time, worst case', <M>O(V + E)</M>],
          ['Memory', <M>O(V)</M>],
        ]}
      />

      <Section id="idea" title="The idea">
        <p>
          Breadth-first search keeps its frontier in a <b>queue</b>, like people waiting at a
          counter: whoever joined first is served first. Everything one road from A joins the queue
          before anything two roads away, so the search finishes each ring before it starts the
          next.
        </p>
        <p>
          It marks places as <b>seen</b> the moment they join the queue, so nothing joins twice.
          That is what keeps it fast and simple, and also why it never notices that a later,
          longer-looking way would have been cheaper.
        </p>
      </Section>

      <Section id="step" title="Step through it">
        <p>
          A road straight from S to T that costs 9, and a detour through A and B that costs 3 in
          all. Press <b>Show as Dijkstra</b> to compare.
        </p>
        <StepDiagram network={HOPS} algorithm="bfs" compareWith="dijkstra" />
      </Section>

      <Section id="frontier" title="The frontier, in order">
        <p>
          A queue adds at the back and takes from the front, both in constant time. After expanding
          S above, it holds:
        </p>
        <FrontierStrip items={[{ id: 'T' }, { id: 'A' }]} note="… oldest first" />
      </Section>

      <CodeBlock algorithm="bfs" focus={6}>
        Line 6 takes the oldest node. Line 9 is the whole rule: a road only matters if it leads
        somewhere new. Nothing here looks at what a road costs.
      </CodeBlock>

      <Section id="fewest" title="Fewest roads is not cheapest">
        <p>
          Breadth-first search counts roads. When every road costs the same, as in a maze, a board
          game or a network of friends, counting roads is counting cost, and the route it finds is
          the best one. On a real map a road can be ten metres or ten kilometres long, so its answer
          is often a poor route that happens to have few turns.
        </p>
        <Callout title="Try it on the map">
          Run breadth-first search and Dijkstra together. Breadth-first often reaches B first, after
          fewer expansions, but the results table shows its route costs more.
        </Callout>
      </Section>

      <StreetsCompare
        pair={['bfs', 'dijkstra']}
        title="Breadth-first and Dijkstra on the same streets"
      >
        {([bfs, dijkstra]) => (
          <p>
            Both spread out in every direction from A. Breadth-first&rsquo;s route takes{' '}
            {formatCost(bfs.route!.cost, 'fastest')}; Dijkstra&rsquo;s takes{' '}
            {formatCost(dijkstra.route!.cost, 'fastest')}.
          </p>
        )}
      </StreetsCompare>

      <Section id="cost" title="How much work it does">
        <p>
          Every node joins the queue at most once and every road is looked at at most once from each
          end, so the time is <M>O(V + E)</M>: as fast as a search can be. The queue can hold a
          whole ring at once, which on a city grid grows with the distance from A.
        </p>
      </Section>

      <Section id="used" title="Where it is used">
        <ul>
          <li>Shortest paths when every step costs the same: mazes, puzzles, grid games.</li>
          <li>&ldquo;Degrees of separation&rdquo; in social networks.</li>
          <li>Web crawlers, flood fill in paint programs, and checking what can be reached.</li>
        </ul>
      </Section>

      <ArticleNav slug="bfs" />
    </>
  );
}
