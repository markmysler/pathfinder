import { useMemo } from 'react';
import { algorithms, type AlgorithmId } from '../../algorithms';
import { learnHref } from '../../app/routes';
import { algoColor } from '../../ui/algorithmStyle';
import { formatCost, formatCount } from '../../ui/format';
import styles from '../Article.module.css';
import { ArticleHeader, ArticleNav, OsmCredit, Section, WideTable } from '../kit';
import { topic } from '../topics';
import { streetSearch } from '../streets';
import { WhichTable } from '../WhichTable';

const IDS = Object.keys(algorithms) as AlgorithmId[];

/** Every algorithm on the recorded streets, for a fair side-by-side. */
function StreetResults() {
  const rows = useMemo(() => IDS.map((id) => ({ id, run: streetSearch(id) })), []);
  const best = Math.min(...rows.map((r) => r.run.route?.cost ?? Infinity));
  return (
    <WideTable label="Every algorithm on the same streets">
      <table>
        <thead>
          <tr>
            <th scope="col">Algorithm</th>
            <th scope="col">Nodes expanded</th>
            <th scope="col">Route time</th>
            <th scope="col">vs. best</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, run }) => {
            const cost = run.route?.cost ?? Infinity;
            const worse = cost > best + 0.5 ? `+${Math.round((100 * (cost - best)) / best)}%` : '—';
            return (
              <tr key={id} style={algoColor(id)}>
                <th scope="row">
                  <span className={styles.algoName}>
                    <span className={styles.dot} aria-hidden="true" />
                    {algorithms[id].name}
                  </span>
                </th>
                <td className={styles.mono}>{formatCount(run.expanded)}</td>
                <td className={styles.mono}>{formatCost(cost, 'fastest')}</td>
                <td className={styles.mono}>{worse}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </WideTable>
  );
}

export default function WhichArticle() {
  return (
    <>
      <ArticleHeader
        topic={topic('which')}
        lede="There is no best search, only the best one for the question. These are the questions to ask, and the algorithm each answer points to."
      />

      <Section id="questions" title="Ask yourself">
        <ol>
          <li>
            <b>Does the route have to be the cheapest?</b> If yes, use{' '}
            <a href={learnHref('dijkstra')}>Dijkstra</a> or <a href={learnHref('astar')}>A*</a>. The
            others can return worse routes.
          </li>
          <li>
            <b>Do you know where you are going, and have a safe guess at the distance?</b> Then A*:
            same answer as Dijkstra, usually far less work.
          </li>
          <li>
            <b>Do you know both ends, and want less exploring without a guess?</b> Search from both:{' '}
            <a href={learnHref('bidirectional')}>bidirectional</a> Dijkstra finds the same route as
            Dijkstra, often after about half the work.
          </li>
          <li>
            <b>Does every road cost the same?</b> Then{' '}
            <a href={learnHref('bfs')}>breadth-first search</a> finds the cheapest route and is the
            fastest search of all.
          </li>
          <li>
            <b>Is &ldquo;can I get there at all?&rdquo; the only question?</b> Breadth-first or{' '}
            <a href={learnHref('dfs')}>depth-first</a>: both answer it in time proportional to the
            map.
          </li>
          <li>
            <b>Is a good-enough route, fast, worth more than the best one?</b>{' '}
            <a href={learnHref('greedy')}>Greedy best-first</a>, or A* with an estimate weight above
            1×, which at least bounds how much worse the route can be.
          </li>
          <li>
            <b>Do you need the distance to everywhere, not just to B?</b> Dijkstra, run until the
            frontier is empty.
          </li>
        </ol>
      </Section>

      <Section id="table" title="Side by side">
        <WhichTable />
      </Section>

      <Section id="streets" title="On the same streets">
        <p>
          Every algorithm on the recorded Plaza de Mayo streets, finding a car&rsquo;s fastest route
          between the same two corners:
        </p>
        <StreetResults />
        <p className={styles.small}>
          <OsmCredit />
        </p>
        <p className={styles.small}>
          A small area keeps the differences small. Run them on a whole city in Explore to see the
          gaps grow.
        </p>
      </Section>

      <ArticleNav slug="which" />
    </>
  );
}
