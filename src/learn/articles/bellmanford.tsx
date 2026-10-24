import { formatCount } from '../../ui/format';
import { NegativeCostFigure } from '../AdvancedFigures';
import styles from '../Article.module.css';
import {
  ArticleHeader,
  ArticleNav,
  Callout,
  CodeBlock,
  Glance,
  M,
  Section,
  WideTable,
} from '../kit';
import { MEASURED } from '../measured';
import { topic } from '../topics';

export default function BellmanFordArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('bellmanford')}
        watch="bellmanford"
        race="dijkstra"
        lede="Dijkstra rests on one rule: no road costs less than nothing. Bellman-Ford doesn't need it. It keeps correcting costs, round after round, until nothing improves. That makes it slow, but it stays right when some costs are negative, and it can tell when a loop would make a route endlessly cheaper."
      />

      <Glance
        items={[
          ['Frontier', 'A queue of nodes that just got cheaper'],
          ['Finds the cheapest route?', 'Always, even with negative costs'],
          ['Stops when', 'A round changes nothing'],
          ['Expands a node', 'Every time it gets cheaper'],
          ['Time, worst case', <M key="t">O(V × E)</M>],
          ['Good for', 'Negative costs; finding negative loops'],
        ]}
      />

      <Section id="negative" title="When a road costs less than nothing">
        <p>
          Time and distance are never negative, but other costs can be. An electric car measuring
          energy gets some back on every long downhill. A delivery route might earn money at some
          stops. A trader converting currencies works with costs where a lucky loop pays out.
        </p>
        <p>
          Dijkstra takes the cheapest waiting node and treats its cost as final, because any other
          way would have to go through something that already costs more. A negative road breaks
          that promise.
        </p>
        <NegativeCostFigure />
      </Section>

      <Section id="rounds" title="Rounds, and why they end">
        <p>
          In the textbook version every round relaxes every road: if going to a node along this road
          is cheaper than its cost so far, lower it. After one round, every best route of one road
          is known; after two rounds, of two roads; and so on. No best route repeats a node, so it
          has at most one road fewer than there are nodes, and that many rounds always suffice.
        </p>
        <p>
          Pathfinder runs the queue version: only roads out of nodes that just got cheaper are
          relaxed again, and a round is everything the previous round queued. Same answer, far less
          work.
        </p>
      </Section>

      <Section id="loops" title="Negative loops">
        <p>
          If going round a loop costs less than nothing in total, every lap is cheaper than the
          last, and there is no cheapest route at all. Bellman-Ford notices: a route can&rsquo;t
          need as many roads as there are nodes, so a node still getting cheaper after that many
          rounds must be on, or behind, such a loop. In the diagram above, turn on{' '}
          <b>Add the loop</b>: X, Y and Z get cheaper every round, until Bellman-Ford reports there
          is no cheapest route.
        </p>
      </Section>

      <Section id="streets" title="On real streets">
        <p>
          Streets never cost less than nothing, so Dijkstra is right and Bellman-Ford&rsquo;s
          corrections are wasted effort. Measured on Buenos Aires streets, driving:
        </p>
        <WideTable label="Bellman-Ford and Dijkstra on real streets">
          <table>
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">Dijkstra expands</th>
                <th scope="col">Bellman-Ford expands</th>
                <th scope="col">More by</th>
              </tr>
            </thead>
            <tbody>
              {MEASURED.map((m) => (
                <tr key={m.route}>
                  <th scope="row">{m.route}</th>
                  <td className={styles.mono}>{formatCount(m.expanded.dijkstra)}</td>
                  <td className={styles.mono}>{formatCount(m.expanded.bellmanford)}</td>
                  <td className={styles.mono}>
                    {Math.round(m.expanded.bellmanford / m.expanded.dijkstra)}×
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideTable>
        <p>
          It also can&rsquo;t stop at B: it explores the whole map, since a later round might still
          find a cheaper way. In Explore it stops after 400,000 steps and says so.
        </p>
        <Callout title="Where negative costs really show up">
          Routing protocols such as RIP spread Bellman-Ford&rsquo;s rounds across a network of
          routers, each telling its neighbours what it can reach. In finance, turning exchange rates
          into costs (minus their logarithms) makes a profitable chain of trades a negative loop,
          which is exactly what Bellman-Ford detects.
        </Callout>
      </Section>

      <CodeBlock algorithm="bellmanford" focus={5}>
        There is no &ldquo;if node = goal&rdquo; line: that is the difference from Dijkstra. Line 9
        is the loop check: a node still getting cheaper in round <M>n</M> can only be on a loop that
        pays out.
      </CodeBlock>

      <ArticleNav slug="bellmanford" />
    </>
  );
}
