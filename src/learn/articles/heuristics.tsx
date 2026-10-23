import { ArticleHeader, ArticleNav, Callout, GraphFigure, M, Section } from '../kit';
import { topic } from '../topics';
import { DETOUR } from '../networks';
import { StepDiagram } from '../StepDiagram';

export default function HeuristicsArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('heuristics')}
        lede="A heuristic is an educated guess at the cost still to go from a place to the destination, made without searching. A good one steers a search towards B. A careless one can lead it astray, or make it miss the best route."
      />

      <Section id="straight" title="Straight-line distance">
        <p>
          The guess Pathfinder uses is the straight-line distance to B, &ldquo;as the crow
          flies&rdquo;. It costs almost nothing to work out from two coordinates, and on most street
          grids it points the right way.
        </p>
        <GraphFigure
          width={600}
          height={260}
          nodes={[
            { id: 'n', x: 70, y: 200, label: 'n' },
            { id: 'p', x: 70, y: 60, label: '' },
            { id: 'q', x: 330, y: 60, label: '' },
            { id: 'B', x: 530, y: 120 },
          ]}
          edges={[
            { from: 'n', to: 'p', label: '300 m' },
            { from: 'p', to: 'q', label: '550 m' },
            { from: 'q', to: 'B', label: '210 m' },
            { from: 'n', to: 'B', label: 'h = 470 m', highlight: true },
          ]}
          label="From node n, the roads to B add up to 1,060 metres, while the straight line from n to B is 470 metres."
        >
          The roads from n to B add up to 1,060 m. The straight line, <M>h(n)</M>, is 470 m. It is
          never longer than any road route, which is what makes it safe to use.
        </GraphFigure>
        <p>
          For the fastest route, distance has to become time. Pathfinder divides the straight line
          by the highest speed allowed anywhere on the map, so the guess is the time it would take
          to fly there at top speed: never slower than any real route.
        </p>
      </Section>

      <Section id="admissible" title="Admissible: never overestimate">
        <p>
          A heuristic is <b>admissible</b> if it never guesses more than the true cost. That is the
          condition A* needs to be sure of finding the cheapest route. A guess that is too high can
          make a good route look expensive, and A* might finish before ever trying it.
        </p>
        <p>
          A heuristic of zero everywhere is admissible too, just useless: it tells the search
          nothing, and A* becomes Dijkstra. The best heuristics are as close to the truth as
          possible without going over.
        </p>
      </Section>

      <Section id="consistent" title="Consistent: never jump">
        <p>
          A stronger condition is <b>consistency</b>: for every road from <M>n</M> to <M>m</M>{' '}
          costing <M>c</M>, <M>h(n) ≤ c + h(m)</M>. Taking a road never lowers the estimate by more
          than the road costs. Straight-line distance is consistent, because of the triangle
          inequality. With a consistent heuristic A* never has to expand a node twice;
          Pathfinder&rsquo;s A* re-expands nodes when needed, so it stays correct even when it is
          not.
        </p>
      </Section>

      <Section id="trust" title="How much to trust it">
        <p>
          Uninformed searches (breadth-first, depth-first, Dijkstra) ignore the estimate. Greedy
          best-first trusts it completely: it looks only at <M>h</M>. A* balances the two,{' '}
          <M>f = g + h</M>. Weighted A* leans towards the estimate, <M>f = g + w × h</M>: with{' '}
          <M>w</M> above 1 it explores less and its route can be up to <M>w</M> times the cheapest.
        </p>
        <StepDiagram network={DETOUR} algorithm="greedy" compareWith="astar" />
        <Callout title="Try it on the map">
          Tick A* and drag its estimate weight from 1× to 3×, then run it against Dijkstra. Each
          step up explores less; watch the results table for when the route starts to get worse.
        </Callout>
      </Section>

      <ArticleNav slug="heuristics" />
    </>
  );
}
