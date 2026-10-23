import { ArticleHeader, ArticleNav, Formula, GraphFigure, M, Section } from '../kit';
import { RushHourFigure } from '../RushHour';
import styles from '../Article.module.css';
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
      </Section>

      <Section id="traffic" title="Live traffic">
        <p>
          Speed limits describe empty roads. With live traffic on, Pathfinder asks TomTom or HERE
          how fast each road is moving right now, as a share of its usual free-flowing speed. A road
          moving at half its usual speed takes twice as long, so its edge costs twice as much. A
          closed road stops being an edge at all.
        </p>
        <Formula
          formula={
            <>
              seconds = metres ÷ (speed limit ×{' '}
              <span className={styles.traffic}>share of free flow</span>)
            </>
          }
          parts={[
            [
              'share',
              'the road’s current speed as a share of free flow: 1 when clear, towards 0 in a jam, 0 when closed',
            ],
            ['speed limit', 'the same speed the fastest route uses without traffic'],
          ]}
        />
        <p>
          Nothing about the search changes. Dijkstra and A* run exactly as before, on a graph whose
          costs are different. That is the point: change the weights, and the best route can move
          somewhere else entirely.
        </p>
        <RushHourFigure />
        <h3 className={styles.h3}>Why A* still finds the best route</h3>
        <p>
          A*’s estimate is the straight-line distance to B, divided by the fastest speed anywhere on
          the map. For it to be safe it must never claim B is nearer than it really is. Traffic only
          ever slows a road down, never past its usual speed, so the fastest speed can only drop and
          the estimate stays an underestimate. Pathfinder caps any reading above free flow at free
          flow, so this always holds.
        </p>
        <h3 className={styles.h3}>Matching two maps</h3>
        <p>
          TomTom and HERE describe traffic on their own maps, not on OpenStreetMap. Their lines run
          a few metres to the side of OpenStreetMap’s, are cut in different places, and come one per
          direction. So each edge looks for the provider line nearest its middle that is within 15 m
          and points the same way, within 35°. The edge running the other way looks for a line
          pointing back.
        </p>
        <MatchingFigure />
        <h3 className={styles.h3}>Your key, your quota</h3>
        <p>
          Pathfinder runs entirely in your browser, with no server of its own. Your key is kept in
          this browser only, and the requests go straight from your browser to TomTom or HERE, so
          they count against your key’s free allowance and nobody else’s. When traffic can’t be
          fetched, the run still finishes, using speed limits, and says why.
        </p>
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

/** An OSM edge choosing between two providers' lines, and ignoring a cross street's. */
function MatchingFigure() {
  return (
    <figure className={styles.figureBox}>
      <svg
        viewBox="0 0 720 220"
        className={styles.figureSvg}
        role="img"
        aria-label="An OpenStreetMap street drawn as grey edges between nodes runs left to right. Six metres above it, a red provider line points right, carrying traffic eastbound at 40%; six metres below, a grey provider line points left, westbound at 95%. A dashed circle of 15 metres around the middle of one edge catches both lines; driven eastbound, the edge takes the line pointing right. A cross street's line, pointing up, also passes inside the circle but is ignored because it points the wrong way."
      >
        <defs>
          <marker
            id="match-red"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10z" fill="var(--traffic)" />
          </marker>
          <marker
            id="match-grey"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10z" fill="var(--muted)" />
          </marker>
        </defs>
        <circle
          cx="300"
          cy="110"
          r="62"
          fill="none"
          stroke="var(--text)"
          strokeOpacity="0.6"
          strokeWidth="1.5"
          strokeDasharray="5 5"
        />
        <text x="232" y="52" fill="var(--muted)" fontSize="13" textAnchor="end">
          15 m around the middle
        </text>
        <path
          d="M60 86L680 80"
          fill="none"
          stroke="var(--traffic)"
          strokeWidth="3"
          markerEnd="url(#match-red)"
        />
        <text x="520" y="66" fill="var(--traffic-text)" fontSize="13">
          Provider · eastbound · 40%
        </text>
        <path
          d="M680 138L60 132"
          fill="none"
          stroke="var(--muted)"
          strokeWidth="3"
          markerEnd="url(#match-grey)"
        />
        <text x="520" y="162" fill="var(--muted)" fontSize="13">
          Provider · westbound · 95%
        </text>
        <path
          d="M330 200L330 20"
          fill="none"
          stroke="var(--muted)"
          strokeOpacity="0.6"
          strokeWidth="2.5"
          markerEnd="url(#match-grey)"
        />
        <line
          x1="60"
          y1="110"
          x2="210"
          y2="110"
          stroke="var(--notice-border)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <line
          x1="210"
          y1="110"
          x2="390"
          y2="110"
          stroke="var(--text)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <line
          x1="390"
          y1="110"
          x2="680"
          y2="110"
          stroke="var(--notice-border)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        {[60, 210, 390, 680].map((x) => (
          <circle
            key={x}
            cx={x}
            cy="110"
            r="6"
            fill="var(--bg)"
            stroke="var(--text-2)"
            strokeWidth="2"
          />
        ))}
        <circle cx="300" cy="110" r="4" fill="var(--text)" />
      </svg>
      <figcaption>
        The highlighted edge, driven eastbound, takes the red line: near, and pointing the same way.
        Driven westbound it takes the grey one. The cross street’s line passes just as close but
        points north, so it belongs to another road. In tests on recorded Buenos Aires streets, with
        the provider’s lines shifted 4 m and simplified, 99% of car edges got the right reading and
        none got the opposite direction’s.
      </figcaption>
    </figure>
  );
}
