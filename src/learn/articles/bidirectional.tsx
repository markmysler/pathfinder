import { useMemo } from 'react';
import type { AlgorithmId } from '../../algorithms';
import { learnHref } from '../../app/routes';
import { algoColor, algorithmName } from '../../ui/algorithmStyle';
import { formatCost, formatCount } from '../../ui/format';
import styles from '../Article.module.css';
import {
  ArticleHeader,
  ArticleNav,
  Callout,
  CodeBlock,
  Formula,
  FrontierStrip,
  Glance,
  M,
  OsmCredit,
  Section,
  WideTable,
} from '../kit';
import { TRAP } from '../networks';
import { StepDiagram } from '../StepDiagram';
import { streetSearch } from '../streets';
import { topic } from '../topics';

/** Each one-way search next to the same search from both ends. */
const PAIRS: readonly (readonly [AlgorithmId, AlgorithmId])[] = [
  ['bfs', 'bibfs'],
  ['dijkstra', 'bidijkstra'],
  ['astar', 'biastar'],
];

/** One circle around A reaching B, against two half-size circles from both ends. */
function Circles() {
  const pin = (x: number, label: 'A' | 'B') =>
    label === 'A' ? (
      <g>
        <circle cx={x} cy={95} r={11} fill="#f4f6f8" />
        <text
          x={x}
          y={96}
          fontSize={12}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#0e1116"
        >
          A
        </text>
      </g>
    ) : (
      <g>
        <circle cx={x} cy={95} r={11} fill="#0e1116" stroke="#f4f6f8" strokeWidth={2.5} />
        <text
          x={x}
          y={96}
          fontSize={12}
          fontWeight={700}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#f4f6f8"
        >
          B
        </text>
      </g>
    );
  return (
    <figure className={styles.circles} style={algoColor('bidijkstra')}>
      <div className={styles.circle}>
        <svg
          viewBox="0 0 300 190"
          role="img"
          aria-label="One way: a single circle centred on A that just reaches B."
        >
          <circle
            cx={80}
            cy={95}
            r={150}
            fill="var(--algo-a)"
            fillOpacity={0.12}
            stroke="var(--algo-a)"
            strokeWidth={2}
            strokeDasharray="3 6"
            strokeLinecap="round"
          />
          {pin(80, 'A')}
          {pin(230, 'B')}
        </svg>
        <span>
          One way: a circle of radius <M>d</M>
        </span>
      </div>
      <div className={styles.circle}>
        <svg
          viewBox="0 0 300 190"
          role="img"
          aria-label="Both ends: two circles of half the radius, one centred on A and one on B, touching in the middle."
        >
          <circle
            cx={80}
            cy={95}
            r={75}
            fill="var(--algo-a)"
            fillOpacity={0.12}
            stroke="var(--algo-a)"
            strokeWidth={2}
            strokeDasharray="3 6"
            strokeLinecap="round"
          />
          <circle
            cx={230}
            cy={95}
            r={75}
            fill="var(--algo)"
            fillOpacity={0.1}
            stroke="var(--algo)"
            strokeWidth={1.6}
            strokeDasharray="6 6"
          />
          <path d="M155 86l9 9-9 9-9-9z" fill="#fff" stroke="#0e1116" strokeWidth={2} />
          {pin(80, 'A')}
          {pin(230, 'B')}
        </svg>
        <span>
          Both ends: two circles of radius <M>d / 2</M>
        </span>
      </div>
      <figcaption>
        Dijkstra explores everything closer to A than B is. Two half-size circles cover half the
        area of one full one, <M>2 × π(d/2)² = ½ πd²</M>, so on an even street grid a bidirectional
        search explores about half as much.
      </figcaption>
    </figure>
  );
}

/** Every pair on the recorded streets, with what going both ways saved. */
function StreetResults() {
  const rows = useMemo(
    () =>
      PAIRS.map(([one, two]) => ({
        one,
        two,
        oneRun: streetSearch(one),
        twoRun: streetSearch(two),
      })),
    [],
  );
  const saved = (one: number, two: number) => `${Math.round((100 * (one - two)) / one)}%`;
  const [bfs, dijkstra, astar] = rows;
  return (
    <>
      <WideTable label="One way and both ways, nodes expanded">
        <table aria-label="On the same streets">
          <thead>
            <tr>
              <th scope="col">Algorithm</th>
              <th scope="col">Nodes expanded</th>
              <th scope="col">Route time</th>
            </tr>
          </thead>
          <tbody>
            {rows.flatMap(({ one, two, oneRun, twoRun }) =>
              [
                [one, oneRun],
                [two, twoRun],
              ].map(([id, run]) => {
                const algorithm = id as AlgorithmId;
                const search = run as typeof oneRun;
                return (
                  <tr key={algorithm} style={algoColor(algorithm)}>
                    <th scope="row">
                      <span className={styles.algoName}>
                        <span className={styles.dot} aria-hidden="true" />
                        {algorithmName(algorithm)}
                      </span>
                    </th>
                    <td className={styles.mono}>{formatCount(search.expanded)}</td>
                    <td className={styles.mono}>
                      {search.route ? formatCost(search.route.cost, 'fastest') : '—'}
                    </td>
                  </tr>
                );
              }),
            )}
          </tbody>
        </table>
      </WideTable>
      <p>
        Every bidirectional search found a route as good as its one-way version. Going both ways cut
        Dijkstra&rsquo;s work by {saved(dijkstra!.oneRun.expanded, dijkstra!.twoRun.expanded)},
        BFS&rsquo;s by {saved(bfs!.oneRun.expanded, bfs!.twoRun.expanded)}, and A*&rsquo;s by only{' '}
        {saved(astar!.oneRun.expanded, astar!.twoRun.expanded)}. BFS&rsquo;s route is slower because
        it counts roads, not time.
      </p>
    </>
  );
}

export default function BidirectionalArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('bidirectional')}
        watch="bidijkstra"
        race="dijkstra"
        lede="Why search only from A? A bidirectional search also searches backward from B, and stops once the two searches have met and nothing cheaper can be left. It finds the same route as searching one way, usually after exploring far less."
      />

      <Glance
        items={[
          ['Frontier', 'Two: one from A, one from B'],
          ['Finds the cheapest route?', 'Whenever the one-way search does'],
          ['Stops when', 'Next from A + next from B ≥ best route found'],
          ['Needs', 'A known B, and roads followed backwards'],
          ['Time, worst case', 'Same as one way; often half the nodes'],
          ['Memory', 'Two frontiers, two sets of costs'],
        ]}
      />

      <Section id="idea" title="The idea">
        <p>
          A one-way search spreads out from A until it reaches B.{' '}
          <a href={learnHref('dijkstra')}>Dijkstra</a>, for example, explores everything closer to A
          than B is. A bidirectional search runs two searches at once: one forward from A, and one
          backward from B that follows every road the wrong way, from its end to its start. Each
          only has to cover about half the distance.
        </p>
        <Circles />
      </Section>

      <Section id="step" title="Step through it">
        <p>
          Five intersections. Each step is taken by whichever side&rsquo;s next node is nearer its
          own end: A on a tie. Watch what happens when the sides first touch, then replay it as{' '}
          <b>Dijkstra</b> from A alone.
        </p>
        <StepDiagram network={TRAP} algorithm="bidijkstra" compareWith="dijkstra" />
      </Section>

      <Section id="stop" title="Meeting is not the end">
        <p>
          The first node both sides reach is rarely on the best route: above it is P, on a route
          costing <M>11</M>, while the best route, along the bottom, costs <M>6</M>. Stopping at the
          first meeting is the classic mistake.
        </p>
        <Formula
          formula={<>stop when lowest(A) + lowest(B) ≥ best</>}
          parts={[
            ['lowest(A)', 'The cost from A of the next node waiting on A’s side.'],
            ['lowest(B)', 'The cost to B of the next node waiting on B’s side.'],
            ['best', 'The cheapest route through any meeting point found so far.'],
          ]}
        />
        <p>
          Any route the search has not found yet must leave A&rsquo;s explored area through a node
          still waiting on A&rsquo;s side, and enter B&rsquo;s through one waiting on B&rsquo;s. It
          costs at least the cheapest of each, added together. Once that sum reaches the best route
          found, nothing left can beat it.
        </p>
        <p>
          Each time a side reaches a node the other side has already reached, the search adds the
          two costs. If that beats the best route so far, it becomes the new <b>meeting point</b>.
          Step 4 above finds a better one, R, at <M>4 + 2 = 6</M>, and then stops: <M>4 + 2 ≥ 6</M>.
        </p>
      </Section>

      <Section id="frontier" title="Two frontiers, in order">
        <p>
          Each side has its own frontier, and the side whose cheapest entry is lower goes next.
          After step 2 above:
        </p>
        <div style={algoColor('bidijkstra')}>
          <div className={styles.sideA}>
            <FrontierStrip
              label="From A"
              items={[
                { id: 'P', value: '1' },
                { id: 'Q', value: '2' },
              ]}
              note="A goes next: 1 is less than B's 2."
            />
          </div>
        </div>
        <div style={algoColor('bidijkstra')}>
          <FrontierStrip
            label="From B"
            items={[
              { id: 'R', value: '2' },
              { id: 'P', value: '10' },
            ]}
            note="… each sorted by cost from its own end"
          />
        </div>
      </Section>

      <CodeBlock algorithm="bidijkstra" focus={5}>
        Line 5 is the stop rule and line 14 the meeting check. Everything else is Dijkstra, run by
        whichever side takes the step. Going backward, B follows each road from its end to its
        start, so one-way streets still count the right way round.
      </CodeBlock>

      <Section id="versions" title="Three versions">
        <div className={styles.versions}>
          <div className={styles.version} style={algoColor('bibfs')}>
            <h3>
              <span className={styles.dot} aria-hidden="true" />
              Bidirectional BFS
            </h3>
            <p>
              Counts roads instead of adding up their costs, and grows each side one layer at a
              time. Finds the route with the fewest roads, like <a href={learnHref('bfs')}>BFS</a>.
            </p>
          </div>
          <div className={styles.version} style={algoColor('bidijkstra')}>
            <h3>
              <span className={styles.dot} aria-hidden="true" />
              Bidirectional Dijkstra
            </h3>
            <p>
              The version above. Finds the cheapest route, with two circles that meet roughly
              halfway by cost.
            </p>
          </div>
          <div className={styles.version} style={algoColor('biastar')}>
            <h3>
              <span className={styles.dot} aria-hidden="true" />
              Bidirectional A*
            </h3>
            <p>
              Each side is steered towards the other end. Finds the cheapest route, but needs care
              with the estimates, below.
            </p>
          </div>
        </div>
      </Section>

      <Section id="astar" title="Why not just run A* from both ends?">
        <p>
          <a href={learnHref('astar')}>A*</a> from A orders its frontier by{' '}
          <M>
            g + h<sub>B</sub>
          </M>
          , with an estimate to B; A* from B by{' '}
          <M>
            g + h<sub>A</sub>
          </M>
          , with an estimate from A. The two sides would then disagree about how much each road is
          worth, and the stop rule above no longer holds: the search could stop too early, or run on
          long after the best route is found.
        </p>
        <Formula
          formula={
            <>
              p(n) = ½ (h<sub>B</sub>(n) − h<sub>A</sub>(n))
            </>
          }
          parts={[
            ['From A', <>orders by g + p(n)</>],
            ['From B', <>orders by g − p(n)</>],
            ['With no estimate', 'p is 0 everywhere: exactly bidirectional Dijkstra.'],
          ]}
        />
        <p>
          The fix Pathfinder uses: both sides share one estimate, half the difference of the two.
          Heading towards B lowers it for A and raises it for B by the same amount, so both sides
          price every road alike and the same stop rule works. It needs estimates that never jump (
          <a href={learnHref('heuristics')}>consistent</a> ones), which straight-line distance is.
        </p>
        <Callout title="Not always a win">
          A* already explores a narrow band around the route, so splitting it in two saves little,
          as the table below shows. The bigger gains come from better estimates, such as landmarks
          (ALT), coming later.
        </Callout>
      </Section>

      <Section id="streets" title="On the same streets">
        <p>
          Each search on the recorded Plaza de Mayo streets, finding a car&rsquo;s fastest route
          between the same two corners:
        </p>
        <StreetResults />
        <p className={styles.small}>
          <OsmCredit />
        </p>
      </Section>

      <Section id="used" title="Where it is used">
        <ul>
          <li>Route planners, where it is the starting point for contraction hierarchies.</li>
          <li>&ldquo;Degrees of separation&rdquo; in social networks, with bidirectional BFS.</li>
          <li>Puzzles with a known goal, such as word ladders.</li>
        </ul>
      </Section>

      <ArticleNav slug="bidirectional" />
    </>
  );
}
