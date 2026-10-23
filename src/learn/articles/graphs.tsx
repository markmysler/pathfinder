import { ArticleHeader, ArticleNav, Callout, GraphFigure, M, Section } from '../kit';
import { topic } from '../topics';

const nodes = [
  { id: 'A', x: 60, y: 150 },
  { id: 'B', x: 210, y: 60 },
  { id: 'C', x: 210, y: 240 },
  { id: 'D', x: 380, y: 150 },
  { id: 'E', x: 540, y: 150 },
];

export default function GraphsArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('graphs')}
        lede="A graph is a set of points, called nodes, joined by lines, called edges. That is all it is, and it is enough to describe road maps, friendships, the web and the moves in a game."
      />

      <Section id="nodes" title="Nodes and edges">
        <p>
          A <b>node</b> (or vertex) is a thing; an <b>edge</b> connects two of them. In a road map
          the nodes are intersections and the edges are the streets between them. In a social
          network the nodes are people and an edge means two people know each other.
        </p>
        <GraphFigure
          width={600}
          height={300}
          nodes={nodes}
          edges={[
            { from: 'A', to: 'B' },
            { from: 'A', to: 'C' },
            { from: 'B', to: 'D' },
            { from: 'C', to: 'D' },
            { from: 'D', to: 'E' },
          ]}
          label="Five nodes, A to E. A connects to B and C, both connect to D, and D connects to E."
        >
          Five nodes and five edges. Two nodes joined by an edge are <b>neighbours</b>: B and C are
          A&rsquo;s neighbours. The number of edges at a node is its <b>degree</b>.
        </GraphFigure>
      </Section>

      <Section id="weights" title="Weights: what an edge costs">
        <p>
          Edges can carry a number, called a <b>weight</b> or cost: a distance, a travel time, a
          price. The cost of a route is the sum of its edges&rsquo; weights. Below, the route A → B
          → D costs 2 + 6 = 8, while A → C → D costs 3 + 2 = 5, even though both use two edges.
        </p>
        <GraphFigure
          width={600}
          height={300}
          nodes={nodes}
          edges={[
            { from: 'A', to: 'B', label: '2' },
            { from: 'A', to: 'C', label: '3', highlight: true },
            { from: 'B', to: 'D', label: '6' },
            { from: 'C', to: 'D', label: '2', highlight: true },
            { from: 'D', to: 'E', label: '4', highlight: true },
          ]}
          label="The same graph with weights: A to B 2, A to C 3, B to D 6, C to D 2, D to E 4. The cheapest route from A to E, through C and D, is highlighted."
        >
          The cheapest route from A to E goes through C and D and costs 9. Finding routes like this
          is the <b>shortest path problem</b>, and it is what every algorithm here solves, some
          better than others.
        </GraphFigure>
      </Section>

      <Section id="direction" title="Direction">
        <p>
          In a <b>directed</b> graph an edge goes one way only, drawn as an arrow. A one-way street
          is a directed edge; a two-way street is a pair of them, one each way. Directions matter:
          in the picture you can go from B to D, but not back.
        </p>
        <GraphFigure
          width={600}
          height={300}
          nodes={nodes}
          edges={[
            { from: 'A', to: 'B', directed: true },
            { from: 'B', to: 'A', directed: true },
            { from: 'A', to: 'C', directed: true },
            { from: 'B', to: 'D', directed: true },
            { from: 'D', to: 'C', directed: true },
            { from: 'D', to: 'E', directed: true },
          ]}
          label="A directed graph. A and B point at each other; A points to C; B points to D; D points to C and to E."
        >
          From A you can reach every node; from C you can reach none. A graph where every node can
          reach every other is <b>strongly connected</b>.
        </GraphFigure>
      </Section>

      <Section id="stored" title="How a computer stores one">
        <p>
          The usual way is an <b>adjacency list</b>: for each node, the list of edges leaving it.
          Searches ask &ldquo;what are this node&rsquo;s neighbours?&rdquo; constantly, and an
          adjacency list answers that without looking at the rest of the graph.
        </p>
        <p>
          Pathfinder packs all the lists into one array, sorted by the node they leave from, plus a
          second array saying where each node&rsquo;s edges start. This layout, called{' '}
          <b>compressed sparse row</b> (CSR), keeps a city&rsquo;s hundreds of thousands of edges in
          a few flat blocks of memory that are quick to scan and cheap to send to the background
          thread that runs the searches.
        </p>
        <Callout title="Sizes, in letters">
          Articles here write <M>V</M> for the number of nodes and <M>E</M> for the number of edges.
          A search that is <M>O(V + E)</M> does work in proportion to the size of the graph;{' '}
          <M>O((V + E) log V)</M> is a little more, because keeping a priority queue in order costs
          extra.
        </Callout>
      </Section>

      <ArticleNav slug="graphs" />
    </>
  );
}
