import { learnHref } from '../../app/routes';
import { ArticleHeader, ArticleNav, Callout, M, Section } from '../kit';
import { topic } from '../topics';
import { SIX } from '../networks';
import { StepDiagram } from '../StepDiagram';
import { PseudocodeListing } from '../../ui/Pseudocode';
import styles from '../Article.module.css';

const LOOP = [
  'function search(start, goal)',
  '  frontier ← {start}',
  '  while frontier is not empty',
  '    node ← frontier.take()',
  '    if node = goal: return path to node',
  '    for each road from node to next',
  '      if the road helps: frontier.add(next)',
  '  return "no route"',
];

export default function FrontierArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('frontier')}
        lede="Every search on this site works the same way. It keeps a frontier of places it has reached but not yet explored from, takes one out, looks at its roads, and repeats. The only thing that changes between algorithms is which place it takes next."
      />

      <Section id="loop" title="One loop for every search">
        <PseudocodeListing lines={LOOP} focus={4} size="large" />
        <p>
          Line 4 is the only line that differs much from one algorithm to the next: which node does{' '}
          <M>take()</M> hand back? Line 7 differs a little: does a road &ldquo;help&rdquo; if it
          leads somewhere new, or only if it leads somewhere more cheaply?
        </p>
      </Section>

      <Section id="words" title="The words">
        <dl className={styles.terms}>
          <div>
            <dt>Frontier</dt>
            <dd>
              The places that have been reached but not yet explored from: the edge of what the
              search knows. On the map they are the dots.
            </dd>
          </div>
          <div>
            <dt>Expanded (or explored)</dt>
            <dd>
              A node is expanded when it is taken out of the frontier and its roads are looked at.
              The step counter in Pathfinder counts expansions.
            </dd>
          </div>
          <div>
            <dt>Cost so far, g</dt>
            <dd>
              What the best route found so far from A to a node costs: its length in metres, or its
              time in seconds.
            </dd>
          </div>
          <div>
            <dt>Estimate, h</dt>
            <dd>
              A guess at the cost still to go from a node to B. Only informed searches use one; see{' '}
              <a href={learnHref('heuristics')}>Heuristics</a>.
            </dd>
          </div>
        </dl>
      </Section>

      <Section id="step" title="Step through it">
        <p>
          Breadth-first search, the simplest choice: it takes whatever has waited longest. Replay it
          as <b>DFS</b> to take whatever arrived most recently instead, and watch the same loop
          wander off.
        </p>
        <StepDiagram network={SIX} algorithm="bfs" compareWith="dfs" />
      </Section>

      <Section id="choices" title="What takes next">
        <ul>
          <li>
            <b>Oldest first</b>, a queue: <a href={learnHref('bfs')}>breadth-first search</a>.
          </li>
          <li>
            <b>Newest first</b>, a stack: <a href={learnHref('dfs')}>depth-first search</a>.
          </li>
          <li>
            <b>Lowest estimate</b>: <a href={learnHref('greedy')}>greedy best-first</a>.
          </li>
          <li>
            <b>Lowest cost so far</b>: <a href={learnHref('dijkstra')}>Dijkstra</a>.
          </li>
          <li>
            <b>Lowest cost so far plus estimate</b>: <a href={learnHref('astar')}>A*</a>.
          </li>
        </ul>
      </Section>

      <Section id="outdated" title="Outdated entries">
        <p>
          Dijkstra and A* sometimes find a cheaper way to a node that is already waiting in the
          frontier. Rather than dig the old entry out, they add a new one and leave the old one
          where it is. When the old one comes up later it is <b>outdated</b>, and the search simply
          skips it. The inspector&rsquo;s Frontier view counts these.
        </p>
        <Callout title="Reading the map">
          Tinted lines are explored roads, dots are the frontier, the ringed white dot is the node
          being expanded, and the thick line is the route once B is reached. Open the
          inspector&rsquo;s Frontier view to see the frontier in the order it will be taken.
        </Callout>
      </Section>

      <ArticleNav slug="frontier" />
    </>
  );
}
