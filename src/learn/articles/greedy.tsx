import { formatCount } from '../../ui/format';
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
import { DETOUR } from '../networks';
import { StepDiagram } from '../StepDiagram';

export default function GreedyArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('greedy')}
        watch="greedy"
        race="astar"
        lede="Greedy best-first search always heads for whichever place looks closest to the destination. It is often astonishingly quick, and easily fooled: looking close is not the same as being close by road."
      />

      <Glance
        items={[
          [
            'Frontier',
            <>
              Priority queue, lowest estimate <M>h</M> first
            </>,
          ],
          ['Finds the cheapest route?', 'No'],
          ['Uses road costs?', 'No, only to report the route'],
          ['Uses an estimate?', 'Yes: straight-line distance to B'],
          ['Time, worst case', <M>O((V + E) log V)</M>],
          ['Memory', <M>O(V)</M>],
        ]}
      />

      <Section id="idea" title="The idea">
        <p>
          Greedy best-first search orders its frontier by <M>h</M>, a guess at the cost still to go,
          usually the straight-line distance to B. It ignores <M>g</M>, what it has already spent.
          So it charges towards B, and while the roads go that way it barely explores anything else.
        </p>
        <p>
          The trouble comes when the roads do not go that way: a river, a railway or a one-way
          system between it and B. Having ignored the cost so far, it has no reason to turn back,
          and happily takes a long way round.
        </p>
      </Section>

      <Section id="step" title="Step through it">
        <p>
          A looks very close to T, but the only road from A to T is a long detour costing 10. The
          road through B costs 3 more at the start and is much cheaper overall. Press{' '}
          <b>Show as A*</b>, which adds the cost so far to the same estimate.
        </p>
        <StepDiagram network={DETOUR} algorithm="greedy" compareWith="astar" />
      </Section>

      <Section id="frontier" title="The frontier, in order">
        <p>
          A priority queue ordered by <M>h</M> alone. After expanding S above, it holds:
        </p>
        <FrontierStrip
          items={[
            { id: 'A', value: 'h 1' },
            { id: 'B', value: 'h 3' },
          ]}
          note="… sorted by h, lowest first"
        />
      </Section>

      <CodeBlock algorithm="greedy" focus={6}>
        The same loop as breadth-first search, with the queue swapped for one ordered by <M>h</M>.
        Each node joins the frontier once, the first time it is seen (line 9), so a cheaper way
        found later is ignored.
      </CodeBlock>

      <Section id="fooled" title="How it gets fooled">
        <p>
          A search can only be as good as what it pays attention to. Greedy pays attention to the
          estimate and nothing else, so every flaw in the estimate becomes a flaw in the route. A*
          uses the same estimate but adds the real cost so far, <M>f = g + h</M>, which is exactly
          what lets it notice that the detour through A has become expensive.
        </p>
        <Callout title="Try it on the map">
          Pick two points on either side of a river or a park. Greedy reaches B in very few steps,
          then the results table shows how much worse its route is than A*&rsquo;s.
        </Callout>
      </Section>

      <StreetsCompare pair={['greedy', 'astar']} title="Greedy and A* on the same streets">
        {([greedy, astar]) => (
          <p>
            Greedy expanded {formatCount(greedy.expanded)} nodes and A* expanded{' '}
            {formatCount(astar.expanded)}.{' '}
            {greedy.route!.cost > astar.route!.cost + 0.5
              ? `Greedy's route is ${Math.round((100 * (greedy.route!.cost - astar.route!.cost)) / astar.route!.cost)}% slower.`
              : 'Here both routes are equally fast: the streets happen to point the right way.'}
          </p>
        )}
      </StreetsCompare>

      <Section id="cost" title="How much work it does">
        <p>
          With a heap the worst case is the same as Dijkstra&rsquo;s, <M>O((V + E) log V)</M>, and a
          misleading estimate can make it explore most of the map. With a good estimate it often
          expands little more than the nodes on its route.
        </p>
      </Section>

      <Section id="used" title="Where it is used">
        <ul>
          <li>Quick, good-enough answers, when the route does not have to be the best.</li>
          <li>Game characters that should look purposeful rather than perfect.</li>
          <li>As a step inside other searches, such as beam search.</li>
        </ul>
      </Section>

      <ArticleNav slug="greedy" />
    </>
  );
}
