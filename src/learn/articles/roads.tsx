import { ArticleHeader, ArticleNav, Callout, GraphFigure, M, Section } from '../kit';
import { topic } from '../topics';

export default function RoadsArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('roads')}
        lede="To search a map, Pathfinder first turns it into a graph. Every intersection and bend becomes a node, every stretch of road between two of them becomes an edge, and each edge gets a cost."
      />

      <Section id="data" title="Where the roads come from">
        <p>
          The streets come from <b>OpenStreetMap</b>, the map anyone can edit. When you press Run,
          Pathfinder asks a public Overpass server for every road in a box around A and B.
          OpenStreetMap describes a road as a <b>way</b>: a list of points, with tags such as{' '}
          <M>highway=residential</M>, <M>oneway=yes</M> or <M>maxspeed=40</M>. The answer is saved
          in your browser for a week, so the same area loads instantly next time.
        </p>
      </Section>

      <Section id="edges" title="From ways to edges">
        <p>
          Each pair of consecutive points on a way becomes an edge. Points shared by two ways are
          intersections, where a search can turn. Points along a curve are nodes too: they give the
          road its shape on the map.
        </p>
        <GraphFigure
          width={600}
          height={260}
          nodes={[
            { id: 'a', x: 60, y: 70, label: '' },
            { id: 'b', x: 240, y: 70, label: '' },
            { id: 'c', x: 420, y: 70, label: '' },
            { id: 'd', x: 540, y: 130, label: '' },
            { id: 'e', x: 240, y: 200, label: '' },
            { id: 'f', x: 420, y: 200, label: '' },
          ]}
          edges={[
            { from: 'a', to: 'b', label: '120 m' },
            { from: 'b', to: 'c', label: '120 m' },
            { from: 'c', to: 'd', label: '70 m' },
            { from: 'b', to: 'e', label: '95 m' },
            { from: 'e', to: 'f', directed: true, label: 'one-way' },
            { from: 'c', to: 'f', label: '95 m' },
          ]}
          label="A few streets as a graph: a main road along the top with a bend at the right, two cross streets, and a one-way street along the bottom."
        >
          A main street along the top with a bend at the end, two cross streets, and a one-way
          street along the bottom. Every circle is a node; the one-way street is a single arrow.
        </GraphFigure>
      </Section>

      <Section id="access" title="Who may use which road, and which way">
        <p>
          Pathfinder builds a separate graph for each way of travelling. Cars keep to roads they are
          allowed on and follow one-way streets. Bikes may also use cycle paths, and some one-way
          streets allow bikes both ways. Walkers can use footpaths and pedestrian streets, and
          ignore one-way signs altogether. Motorways are for cars only.
        </p>
        <p>
          Then it keeps only the largest part of each graph where every node can reach every other
          (the largest <b>strongly connected component</b>). Otherwise A might snap to the end of a
          one-way street that has no way out.
        </p>
      </Section>

      <Section id="cost" title="What an edge costs">
        <p>
          For the <b>shortest</b> route an edge costs its length in metres. For the <b>fastest</b>{' '}
          route it costs the seconds it takes: its length divided by a speed. For cars that is the
          speed limit from the <M>maxspeed</M> tag, or a default for the kind of road when the tag
          is missing. Bikes ride at about 15 km/h on streets and 10 km/h on shared paths; walkers go
          about 5 km/h, and half that on steps.
        </p>
        <Callout title="Speed limits, not traffic">
          Real traffic can be far slower than the limit. Live traffic, from your own TomTom or HERE
          key, is coming in a later phase; until then the fastest route assumes clear roads.
        </Callout>
      </Section>

      <Section id="snap" title="Snapping A and B to the roads">
        <p>
          A point you drop on the map is rarely exactly on a road, so the search starts from the
          nearest node instead. The thin grey line on the map joins where you put A or B to the node
          the search actually used.
        </p>
      </Section>

      <ArticleNav slug="roads" />
    </>
  );
}
