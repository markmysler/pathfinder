import { formatCost } from '../../ui/format';
import {
  ArticleHeader,
  ArticleNav,
  Callout,
  CodeBlock,
  Formula,
  FrontierStrip,
  Glance,
  M,
  Section,
  StreetsCompare,
} from '../kit';
import { topic } from '../topics';
import { SIX } from '../networks';
import { StepDiagram } from '../StepDiagram';

export default function AStarArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('astar')}
        watch="astar"
        race="dijkstra"
        lede="A* finds the cheapest route, just like Dijkstra. The difference is that it also estimates how far each place is from the destination, and explores the promising places first. On city streets it often does a fraction of the work."
      />

      <Glance
        items={[
          [
            'Frontier',
            <>
              Priority queue, lowest <M>g + h</M> first
            </>,
          ],
          [
            'Finds the cheapest route?',
            <>
              Yes, if <M>h</M> never overestimates
            </>,
          ],
          ['Uses road costs?', 'Yes'],
          ['Uses an estimate?', 'Yes: straight-line distance to B'],
          ['Time, worst case', <M>O((V + E) log V)</M>],
          ['Memory', <M>O(V)</M>],
        ]}
      />

      <Section id="idea" title="The idea">
        <p>
          Every search keeps a <b>frontier</b>: the places it has reached but not yet explored from.
          What really separates one algorithm from another is how it picks the next frontier node to
          explore.
        </p>
        <p>
          Dijkstra always takes the node with the lowest cost so far, <M>g</M>. That spreads it out
          evenly in every direction, like a ripple on a pond. A* adds <M>h</M>, an estimate of the
          cost still to go, and takes the node with the lowest total. Nodes that lead away from B
          get a large <M>h</M>, so A* leaves them for later, often for good.
        </p>
        <Formula
          formula={<>f(n) = g(n) + h(n)</>}
          parts={[
            ['g(n)', 'What it actually cost to get from A to n.'],
            ['h(n)', 'A guess at the cost from n to B, made without searching.'],
            ['f(n)', 'The estimated cost of the best route that passes through n.'],
          ]}
        />
      </Section>

      <Section id="step" title="Step through it">
        <p>
          A tiny road network: six intersections, with the travel cost written on each road. Each
          box shows its <M>g</M>, <M>h</M> and <M>f</M> once A* has reached it. Replay it as{' '}
          <b>Dijkstra</b> to see the same roads without the estimate.
        </p>
        <StepDiagram network={SIX} algorithm="astar" compareWith="dijkstra" />
      </Section>

      <Section id="frontier" title="The frontier, in order">
        <p>
          A* keeps its frontier in a <b>priority queue</b>: a structure that always hands back its
          smallest entry quickly. Pathfinder uses a binary heap, which adds or removes an entry in{' '}
          <M>O(log n)</M> steps. At step 3 above it holds:
        </p>
        <FrontierStrip
          items={[
            { id: 'B', value: 'f 6' },
            { id: 'C', value: 'f 7' },
            { id: 'D', value: 'f 9' },
          ]}
          note="… sorted by f, lowest first"
        />
      </Section>

      <CodeBlock algorithm="astar" focus={6}>
        Line 6 is what happened at step 3 above. Instead of updating an entry in place when it finds
        a cheaper way to a node, Pathfinder pushes a new one and skips the outdated one when it
        comes up (line 7). In the inspector, the Pseudocode view walks through these lines for any
        step of a real search.
      </CodeBlock>

      <Section id="admissible" title="Why the estimate must never overestimate">
        <p>
          A* is only guaranteed to find the cheapest route if <M>h</M> is <b>admissible</b>: it
          never guesses more than the true remaining cost. If it overestimates, A* can write off the
          real best route as too expensive and never look at it.
        </p>
        <p>
          Straight-line distance is admissible for the shortest route, because no road is shorter
          than a straight line. For the fastest route, Pathfinder divides that distance by the top
          speed allowed anywhere on the map, so the guess is never slower than reality.
        </p>
        <Callout title="Try breaking it">
          Turn up the <b>estimate weight</b> in A*&rsquo;s settings. Above 1× it trusts the estimate
          more than the roads: it explores even less, but its route can be worse than the best, by
          at most the weight (1.5× means at most 50% worse). Race it against Dijkstra and the
          results table shows how much worse the route got.
        </Callout>
      </Section>

      <StreetsCompare pair={['dijkstra', 'astar']} title="Dijkstra and A* on the same streets">
        {([dijkstra, astar]) => (
          <p>
            Both find a route taking {formatCost(astar.route!.cost, 'fastest')}. Dijkstra explores
            every street that is cheaper to reach than the destination, in every direction. A*
            explores a band pointing at B, and expands{' '}
            {Math.round((100 * astar.expanded) / dijkstra.expanded)}% as many nodes.
          </p>
        )}
      </StreetsCompare>

      <Section id="cost" title="How much work it does">
        <p>
          In the worst case A* is no better than Dijkstra: <M>O((V + E) log V)</M> time with a
          binary heap, for <M>V</M> intersections and <M>E</M> road segments. In practice a good
          estimate means it never touches most of the map. With an estimate of zero everywhere, A*
          becomes exactly Dijkstra.
        </p>
      </Section>

      <Section id="used" title="Where it is used">
        <ul>
          <li>
            Navigation apps, usually on top of preprocessing such as landmarks (ALT) or contraction
            hierarchies, both coming later.
          </li>
          <li>Video games, to move characters around a level.</li>
          <li>Robot motion planning and puzzle solvers, such as the 15-puzzle.</li>
        </ul>
      </Section>

      <ArticleNav slug="astar" />
    </>
  );
}
