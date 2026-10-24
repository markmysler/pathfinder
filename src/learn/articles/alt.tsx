import { formatCount, formatMs } from '../../ui/format';
import { LandmarkFigure, LandmarkMap } from '../AdvancedFigures';
import styles from '../Article.module.css';
import { ArticleHeader, ArticleNav, CodeBlock, Glance, M, Section, StreetsCompare } from '../kit';
import { MEASURED } from '../measured';
import { topic } from '../topics';

export default function AltArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('alt')}
        watch="alt"
        race="astar"
        lede="A*'s straight line is a cautious guess: it pretends every road is straight and as fast as the fastest. ALT measures real travel times to and from a few landmarks once, and from them works out a much sharper guess that still never overestimates. Same best route as A*, often a fraction of the exploring."
      />

      <Glance
        items={[
          ['Prepares', '8 landmarks, with times to and from every node'],
          ['Finds the cheapest route?', 'Always'],
          [
            'Frontier',
            <>
              Priority queue by <M>g + h</M>, exactly as A*
            </>,
          ],
          ['Estimate h', 'The largest bound any landmark gives'],
          ['Memory', '16 numbers per node'],
          ['Catch', 'New road costs mean measuring again'],
        ]}
      />

      <Section id="triangle" title="The triangle trick">
        <p>
          Pick a landmark L somewhere beyond the goal. Going from a node n to L through the goal is
          one way of getting to L, so it can&rsquo;t beat the best way:
        </p>
        <p className={styles.formulaLine}>cost(n → L) ≤ cost(n → goal) + cost(goal → L)</p>
        <p>Move one term across and it says how much of the trip to the goal is left, at least:</p>
        <p className={styles.formulaLine}>cost(n → goal) ≥ cost(n → L) − cost(goal → L)</p>
        <p>
          Both numbers on the right were measured while preparing, so the guess costs two lookups. A
          landmark behind the start works the same way round: <M>cost(L → goal) − cost(L → n)</M>.
          With one-way streets the two directions differ, which is why each landmark keeps both.
        </p>
        <LandmarkFigure />
      </Section>

      <Section id="choose" title="Choosing landmarks">
        <p>
          A landmark helps most when it lies behind the start or beyond the goal, so the trip points
          straight at it. That favours the edge of the map. Pathfinder picks them farthest first:
          the node farthest from the start, then each time the node farthest from all landmarks so
          far. Eight is enough to surround a city.
        </p>
        <LandmarkMap />
      </Section>

      <StreetsCompare pair={['astar', 'alt']} title="A* and ALT on the same streets">
        {([astar, alt]) => (
          <p>
            Both find the same route. A* expanded {formatCount(astar.expanded)} nodes for it, ALT{' '}
            {formatCount(alt.expanded)}.
          </p>
        )}
      </StreetsCompare>

      <Section id="numbers" title="How much it saves">
        <p>
          Measured on Buenos Aires streets, driving, fastest route. The straight line has to assume
          the top speed limit everywhere, so it guesses low on slow streets. Landmarks know the real
          times.
        </p>
        <div className={styles.table}>
          <table>
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">Preparing</th>
                <th scope="col">A* expands</th>
                <th scope="col">ALT expands</th>
                <th scope="col">Fewer by</th>
              </tr>
            </thead>
            <tbody>
              {MEASURED.map((m) => (
                <tr key={m.route}>
                  <th scope="row">{m.route}</th>
                  <td className={styles.mono}>{formatMs(m.landmarksMs)}</td>
                  <td className={styles.mono}>{formatCount(m.expanded.astar)}</td>
                  <td className={styles.mono}>{formatCount(m.expanded.alt)}</td>
                  <td className={styles.mono}>{(m.expanded.astar / m.expanded.alt).toFixed(1)}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Preparing means two Dijkstra searches over the whole map per landmark, 16 in all. And each
          estimate takes 16 lookups instead of one distance. So ALT shines on big maps, where the
          straight line is a poor guess and one preparation serves many routes.
        </p>
      </Section>

      <CodeBlock algorithm="alt" focus={2}>
        Lines 2 to 4 are all that differ from A*. Preparing chose the landmarks and measured, for
        each, the cost from it and to it for every node: that is where <M>cost(n→L)</M> and the rest
        come from.
      </CodeBlock>

      <ArticleNav slug="alt" />
    </>
  );
}
