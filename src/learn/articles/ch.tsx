import { formatCount, formatMs } from '../../ui/format';
import { ClimbFigure, ContractionFigure } from '../AdvancedFigures';
import styles from '../Article.module.css';
import { ArticleHeader, ArticleNav, CodeBlock, Glance, Section, StreetsCompare } from '../kit';
import { MEASURED } from '../measured';
import { topic } from '../topics';

export default function ContractionHierarchiesArticle() {
  const largest = MEASURED.at(-1);
  return (
    <>
      <ArticleHeader
        topic={topic('ch')}
        watch="ch"
        race="dijkstra"
        lede="Map apps answer a route across a country in a few milliseconds. They don't search harder; they prepare. Contraction hierarchies take the small streets out one at a time, adding shortcuts so no distance changes. Afterwards a search only has to climb towards the big roads from both ends."
      />

      <Glance
        items={[
          ['Prepares', 'An order of importance, and shortcuts'],
          ['Finds the cheapest route?', 'Always'],
          ['Searches', 'From both ends, only uphill'],
          ['Stops when', 'Each side’s next ≥ best route found'],
          ['Memory', 'The roads plus about as many shortcuts'],
          ['Catch', 'Change a road’s cost and it prepares again'],
        ]}
      />

      <Section id="idea" title="The idea: routes climb, then come down">
        <p>
          A long drive leaves your street for a bigger one, joins an avenue or a motorway, and comes
          back down to small streets near the end. If every node had a rank of importance, the best
          route would rise to its most important node and then fall. So a search from A only needs
          roads going up, and a search from B, run backwards, only roads going up too. They meet at
          the top.
        </p>
        <p>
          That only works if climbing never loses the best route. Contraction is how the ranks are
          chosen and how that promise is kept.
        </p>
      </Section>

      <Section id="contract" title="Step 1: contract, least important first">
        <p>
          Take nodes out one by one. Before taking out a node, look at every way through it, from a
          neighbour u to a neighbour w. If a short search finds another way at least as cheap, a{' '}
          <b>witness</b>, nothing is lost. If not, add a shortcut u → w costing the same as going
          through. The order in which nodes go is their rank.
        </p>
        <ContractionFigure />
        <p>
          Which node goes next? The one whose removal changes least: shortcuts it would add, minus
          roads it takes away, plus how many neighbours are already gone, so contraction spreads
          evenly instead of hollowing out one corner. Side streets go early. Junctions of big
          avenues are left for last, and end up at the top.
        </p>
      </Section>

      <Section id="search" title="Step 2: search uphill from both ends">
        <p>
          Now draw every node at the height of its rank, with the original roads and the shortcuts.
          The search from S takes only roads that go up; so does the backward search from T. Every
          best route has an uphill-then-downhill version of the same cost, thanks to the shortcuts,
          so the two climbs are bound to meet at its top.
        </p>
        <ClimbFigure />
        <p>
          <b>Why meeting isn&rsquo;t enough to stop.</b> In bidirectional Dijkstra both sides
          explore everything near them, so once their next costs add up to the best route, they can
          stop. Here each side skips every road going down, so a cheaper meeting point might still
          be ahead of one side. Each side carries on until its cheapest waiting node costs at least
          the best route found.
        </p>
      </Section>

      <StreetsCompare pair={['dijkstra', 'ch']} title="Dijkstra and contraction hierarchies">
        {([dijkstra, ch]) => (
          <p>
            Same route. Dijkstra expanded {formatCount(dijkstra.expanded)} nodes for it; contraction
            hierarchies {formatCount(ch.expanded)}, most of its explored lines being shortcuts drawn
            straight across.
          </p>
        )}
      </StreetsCompare>

      <Section id="pays" title="When preparing pays">
        <p>Measured on Buenos Aires streets, driving, fastest route:</p>
        <div className={styles.table}>
          <table>
            <thead>
              <tr>
                <th scope="col">Route</th>
                <th scope="col">Nodes</th>
                <th scope="col">Preparing</th>
                <th scope="col">Shortcuts added</th>
                <th scope="col">CH expands</th>
                <th scope="col">Dijkstra expands</th>
              </tr>
            </thead>
            <tbody>
              {MEASURED.map((m) => (
                <tr key={m.route}>
                  <th scope="row">{m.route}</th>
                  <td className={styles.mono}>{formatCount(m.nodes)}</td>
                  <td className={styles.mono}>{formatMs(m.contractMs)}</td>
                  <td className={styles.mono}>{formatCount(m.shortcuts)}</td>
                  <td className={styles.mono}>{formatCount(m.expanded.ch)}</td>
                  <td className={styles.mono}>{formatCount(m.expanded.dijkstra)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {largest && (
          <p>
            The bigger the map, the bigger the win: on the {largest.route} route the search expands{' '}
            {Math.round(largest.expanded.dijkstra / largest.expanded.ch)} times fewer nodes. But one
            route never pays for the preparing. A map app prepares once, for everyone, and answers
            millions of routes from it.
          </p>
        )}
      </Section>

      <Section id="traffic" title="The catch: roads that change">
        <p>
          A shortcut&rsquo;s cost is the sum of the roads it stands for, and a witness was only a
          witness at the costs of the moment. When live traffic slows a street, both can be wrong,
          so Pathfinder prepares again for each traffic snapshot. Real systems split preparing in
          two: the order once, which rarely changes, and the costs again in seconds whenever traffic
          moves.
        </p>
      </Section>

      <CodeBlock algorithm="ch" focus={13}>
        The first function is preparing; the second is the search. Line 13 is the stop rule that
        sets it apart from bidirectional Dijkstra: each side on its own against the best route, not
        the two added up. Line 17 only ever looks at roads and shortcuts going up.
      </CodeBlock>

      <ArticleNav slug="ch" />
    </>
  );
}
