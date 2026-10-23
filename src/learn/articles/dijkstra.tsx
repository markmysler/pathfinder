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
import { SIX } from '../networks';
import { StepDiagram } from '../StepDiagram';

export default function DijkstraArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('dijkstra')}
        watch="dijkstra"
        race="astar"
        lede="Dijkstra's algorithm finds the cheapest route by spreading out from the start in order of cost: first everything one minute away, then two minutes, and so on, until it reaches the destination. It needs no idea of where the destination is."
      />

      <Glance
        items={[
          [
            'Frontier',
            <>
              Priority queue, lowest cost so far <M>g</M> first
            </>,
          ],
          ['Finds the cheapest route?', 'Yes, as long as no road has a negative cost'],
          ['Uses road costs?', 'Yes'],
          ['Uses an estimate?', 'No'],
          ['Time, worst case', <M>O((V + E) log V)</M>],
          ['Memory', <M>O(V)</M>],
        ]}
      />

      <Section id="idea" title="The idea">
        <p>
          Dijkstra keeps, for every place it has reached, the cheapest known cost of getting there
          from A, called <M>g</M>. Each step it takes the frontier node with the lowest <M>g</M>,
          and checks every road out of it: if going through this node reaches a neighbour more
          cheaply than any way found so far, the neighbour&rsquo;s <M>g</M> drops and it joins the
          frontier.
        </p>
        <p>
          Because it always takes the cheapest node next, the search grows like a ripple of equal
          cost. On a map that looks like a blob centred on A, stretched along fast roads. Edsger
          Dijkstra described it in 1959; he later said he designed it in about twenty minutes,
          sitting at a café in Amsterdam.
        </p>
      </Section>

      <Section id="step" title="Step through it">
        <p>
          Six intersections and the cost of each road between them. Each box shows <M>g</M> once
          Dijkstra has reached it. Press <b>Show as A*</b> to see how an estimate changes the order.
        </p>
        <StepDiagram network={SIX} algorithm="dijkstra" compareWith="astar" />
      </Section>

      <Section id="frontier" title="The frontier, in order">
        <p>
          The frontier is a <b>priority queue</b> ordered by <M>g</M>. Pathfinder uses a binary
          heap, which adds or removes an entry in <M>O(log n)</M> steps. After expanding S, it
          holds:
        </p>
        <FrontierStrip
          items={[
            { id: 'C', value: 'g 2' },
            { id: 'A', value: 'g 2' },
          ]}
          note="… sorted by g, lowest first; ties go either way"
        />
      </Section>

      <CodeBlock algorithm="dijkstra" focus={6}>
        Line 6 takes the cheapest node. Lines 10 to 13 are the &ldquo;relaxation&rdquo;: a road can
        only lower a neighbour&rsquo;s cost, never raise it. Outdated entries left behind by a
        cheaper push are skipped on line 7.
      </CodeBlock>

      <Section id="why" title="Why the first time it takes a node is the cheapest">
        <p>
          When Dijkstra takes a node with cost <M>g</M>, every other node in the frontier costs at
          least <M>g</M>. Any other way to this node would have to leave the explored area through
          one of those frontier nodes, and roads never cost less than nothing, so that way cannot
          come out cheaper. The node is <b>settled</b>: its cost is final.
        </p>
        <p>
          This is also why it stops as soon as it takes B, and why a single negative cost would
          break it: a later road could make an already settled node cheaper. Bellman-Ford, coming
          later, copes with negative costs by being far more patient.
        </p>
        <Callout title="Distances to everywhere">
          Let Dijkstra run without a destination and it finds the cheapest route from A to every
          reachable place at once. That is how a delivery company can work out travel times from its
          depot to every address in one go.
        </Callout>
      </Section>

      <StreetsCompare
        pair={['bfs', 'dijkstra']}
        title="Breadth-first and Dijkstra on the same streets"
      >
        {([bfs, dijkstra]) => (
          <p>
            Breadth-first search counts roads and ignores their cost; Dijkstra counts minutes.
            Dijkstra&rsquo;s route takes {formatCost(dijkstra.route!.cost, 'fastest')}
            {bfs.route!.cost > dijkstra.route!.cost + 0.5
              ? `; breadth-first's takes ${formatCost(bfs.route!.cost, 'fastest')}.`
              : ', the same as breadth-first here.'}
          </p>
        )}
      </StreetsCompare>

      <Section id="cost" title="How much work it does">
        <p>
          Each node is settled once and each road is relaxed at most once per settle, so with a
          binary heap the time is <M>O((V + E) log V)</M>. With a Fibonacci heap the bound drops to{' '}
          <M>O(E + V log V)</M>, though binary heaps are faster in practice on road networks.
          Without a sense of direction it explores roughly a disc around A whose radius is the
          route&rsquo;s cost, so twice the distance means about four times the work.
        </p>
      </Section>

      <Section id="used" title="Where it is used">
        <ul>
          <li>
            Internet routing: OSPF routers run it to pick the cheapest path through a network.
          </li>
          <li>Travel-time maps (isochrones) that shade everywhere reachable within 15 minutes.</li>
          <li>As the building block that A*, ALT and contraction hierarchies speed up.</li>
        </ul>
      </Section>

      <ArticleNav slug="dijkstra" />
    </>
  );
}
