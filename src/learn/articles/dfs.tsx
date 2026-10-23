import { formatCost, formatCount } from '../../ui/format';
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

export default function DfsArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('dfs')}
        watch="dfs"
        race="bfs"
        lede="Depth-first search follows one road as far as it can, and only when it hits a dead end does it back up and try the most recent turn it skipped. It always finds a route if there is one, but rarely a good one."
      />

      <Glance
        items={[
          ['Frontier', 'Stack: last in, first out'],
          ['Finds the cheapest route?', 'No: the first one it stumbles on'],
          ['Uses road costs?', 'No'],
          ['Uses an estimate?', 'No'],
          ['Time, worst case', <M>O(V + E)</M>],
          ['Memory', <M>O(V)</M>],
        ]}
      />

      <Section id="idea" title="The idea">
        <p>
          Depth-first search keeps its frontier on a <b>stack</b>, like a pile of plates: the last
          one put on is the first one taken off. Every road out of the node it just expanded goes on
          top, so it always carries on from where it is, going deeper, instead of returning to older
          options.
        </p>
        <p>
          It is the strategy of exploring a maze with one hand on the wall: commit to a corridor,
          and only backtrack when it ends. That uses very little memory and needs no costs or
          estimates, which is why it is everywhere in computing, but on a map it wanders.
        </p>
      </Section>

      <Section id="step" title="Step through it">
        <p>
          The same six intersections as in the A* article. The cheapest route costs 6. Watch which
          road depth-first takes from each node, then replay it as <b>BFS</b>.
        </p>
        <StepDiagram network={SIX} algorithm="dfs" compareWith="bfs" />
      </Section>

      <Section id="frontier" title="The frontier, in order">
        <p>
          Pushing onto and popping off a stack both take constant time. After expanding S above, it
          holds:
        </p>
        <FrontierStrip items={[{ id: 'C' }, { id: 'A' }]} note="… newest first" />
      </Section>

      <CodeBlock algorithm="dfs" focus={6}>
        Line 6 takes the newest entry. A node can be on the stack more than once, pushed from
        different places; line 7 skips the copies once it has been expanded. Pathfinder pushes a
        node&rsquo;s roads in reverse, so the first road comes off the stack first.
      </CodeBlock>

      <Section id="long" title="Why its routes are so long">
        <p>
          Depth-first search stops at the first route it completes, and the first route is simply
          wherever the first roads it tried happened to lead. It never compares one route with
          another, and the order it tries roads in has nothing to do with where B is.
        </p>
        <Callout title="Try it on the map">
          Run depth-first search across a neighbourhood. The route it returns loops through side
          streets; compare it with breadth-first search in the results table.
        </Callout>
      </Section>

      <StreetsCompare
        pair={['dfs', 'bfs']}
        title="Depth-first and breadth-first on the same streets"
      >
        {([dfs, bfs]) => (
          <p>
            Depth-first expanded {formatCount(dfs.expanded)} nodes and found a route taking{' '}
            {formatCost(dfs.route!.cost, 'fastest')}. Breadth-first expanded{' '}
            {formatCount(bfs.expanded)} and found one taking{' '}
            {formatCost(bfs.route!.cost, 'fastest')}.
          </p>
        )}
      </StreetsCompare>

      <Section id="cost" title="How much work it does">
        <p>
          Like breadth-first search it handles each node and road a bounded number of times, so its
          time is <M>O(V + E)</M>. It can get lucky and walk straight to B, or unlucky and explore
          almost the whole map first; nothing in the algorithm decides which.
        </p>
      </Section>

      <Section id="used" title="Where depth-first shines">
        <ul>
          <li>Generating and solving mazes, and puzzles that need backtracking, such as Sudoku.</li>
          <li>Finding cycles, and ordering tasks so each comes after what it depends on.</li>
          <li>Splitting a network into the pieces that are connected to each other.</li>
        </ul>
      </Section>

      <ArticleNav slug="dfs" />
    </>
  );
}
