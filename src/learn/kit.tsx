import { useMemo, type ReactNode } from 'react';
import type { AlgorithmId } from '../algorithms';
import { pseudocode } from '../algorithms/pseudocode';
import { exploreHref, learnHref } from '../app/routes';
import { algoColor, ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { formatCount } from '../ui/format';
import { PlayIcon, SparkIcon } from '../ui/icons';
import { PseudocodeListing } from '../ui/Pseudocode';
import styles from './Article.module.css';
import { streetSearch, type StreetSearch } from './streets';
import { GROUP_TITLE, neighbours, type Topic } from './topics';

/** Inline maths or code: `g + h`. */
export const M = ({ children }: { children: ReactNode }) => (
  <span className={styles.mono}>{children}</span>
);

export function ArticleHeader({
  topic,
  lede,
  watch,
  race,
}: {
  topic: Topic;
  lede: ReactNode;
  /** Algorithms to open on the map, and a rival to race against. */
  watch?: AlgorithmId;
  race?: AlgorithmId;
}) {
  const style = topic.algorithm ? ALGORITHM_STYLE[topic.algorithm] : null;
  const short = topic.algorithm === 'astar' ? 'A*' : topic.title;
  return (
    <header className={styles.header}>
      <p className={styles.breadcrumb}>
        <a href={learnHref()}>Learn</a> › {GROUP_TITLE[topic.group]} › {topic.title}
      </p>
      <div className={styles.titleRow}>
        {style && (
          <span className={styles.badge} aria-hidden="true">
            {style.badge}
          </span>
        )}
        <h1 className={styles.title}>{topic.title}</h1>
      </div>
      <p className={styles.lede}>{lede}</p>
      {watch && (
        <div className={styles.actions}>
          <a href={exploreHref([watch])} className={styles.primary}>
            <PlayIcon size={16} />
            Watch {short} on the map
          </a>
          {race && (
            <a href={exploreHref([race, watch])} className={styles.secondary}>
              Race it against {race === 'astar' ? 'A*' : ALGORITHM_STYLE[race].short}
            </a>
          )}
        </div>
      )}
    </header>
  );
}

export function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className={styles.section}>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function Glance({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  return (
    <section aria-labelledby="glance" className={styles.section}>
      <h2 id="glance" className={styles.h2}>
        At a glance
      </h2>
      <dl className={styles.glance}>
        {items.map(([term, value]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A formula with each of its parts explained underneath. */
export function Formula({
  formula,
  parts,
}: {
  formula: ReactNode;
  parts: readonly (readonly [string, ReactNode])[];
}) {
  return (
    <div className={styles.formula}>
      <p className={styles.formulaLine}>{formula}</p>
      <dl className={styles.formulaParts}>
        {parts.map(([term, meaning]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{meaning}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function Callout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.callout}>
      <SparkIcon size={22} className={styles.calloutIcon} />
      <div>
        <p className={styles.calloutTitle}>{title}</p>
        <p className={styles.calloutText}>{children}</p>
      </div>
    </div>
  );
}

/** The frontier as a row of boxes, next one first. */
export function FrontierStrip({
  items,
  note,
}: {
  items: readonly { id: string; value?: string }[];
  note: string;
}) {
  return (
    <div
      className={styles.strip}
      role="figure"
      aria-label={`Frontier: ${items.map((i) => i.id).join(', ')}. ${note}`}
    >
      <span className={styles.stripLabel}>Takes from here</span>
      <span className={styles.stripArrow} aria-hidden="true">
        →
      </span>
      {items.map((item, i) => (
        <span key={item.id} className={styles.stripItem} data-first={i === 0 || undefined}>
          <b>{item.id}</b>
          {item.value && <span className={styles.mono}>{item.value}</span>}
        </span>
      ))}
      <span className={styles.stripLabel}>{note}</span>
    </div>
  );
}

export function CodeBlock({
  algorithm,
  focus,
  children,
}: {
  algorithm: AlgorithmId;
  focus?: number;
  children: ReactNode;
}) {
  return (
    <Section id="code" title="Pseudocode">
      <figure className={styles.codeFigure}>
        <PseudocodeListing lines={pseudocode(algorithm).lines} focus={focus} size="large" />
        <figcaption className={styles.small}>{children}</figcaption>
      </figure>
    </Section>
  );
}

/** One search drawn as a small map of the recorded Plaza de Mayo streets. */
function StreetMap({ run, algorithm }: { run: StreetSearch; algorithm: AlgorithmId }) {
  const [width, height] = run.size;
  const route = run.route?.points.map(([x, y]) => `${x},${y}`).join(' ');
  return (
    <figure className={styles.mapFigure} style={algoColor(algorithm)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.map}
        role="img"
        aria-label={`${ALGORITHM_STYLE[algorithm].short} explored ${run.roads.length} roads`}
      >
        {run.streets.map(([a, b], i) => (
          <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={styles.street} />
        ))}
        {run.roads.map(([a, b], i) => (
          <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} className={styles.explored} />
        ))}
        {route && <polyline points={route} className={styles.routeCasing} />}
        {route && <polyline points={route} className={styles.routeLine} />}
        <circle cx={run.start[0]} cy={run.start[1]} r={7} className={styles.pointA} />
        <circle cx={run.target[0]} cy={run.target[1]} r={7} className={styles.pointB} />
      </svg>
      <figcaption className={styles.mapCaption}>
        <span className={styles.dot} aria-hidden="true" />
        {algorithm === 'astar' ? 'A* search' : ALGORITHM_STYLE[algorithm].short}
        <span className={styles.mapCount}>{formatCount(run.expanded)} expanded</span>
      </figcaption>
    </figure>
  );
}

/** Two algorithms on the same real streets, between the same two corners. */
export function StreetsCompare({
  pair,
  title,
  children,
}: {
  pair: readonly [AlgorithmId, AlgorithmId];
  title: string;
  children?: (runs: [StreetSearch, StreetSearch]) => ReactNode;
}) {
  const [first, second] = pair;
  const runs = useMemo(
    () => [streetSearch(first), streetSearch(second)] as [StreetSearch, StreetSearch],
    [first, second],
  );
  return (
    <Section id="compare" title={title}>
      {children?.(runs)}
      <div className={styles.maps}>
        <StreetMap run={runs[0]} algorithm={pair[0]} />
        <StreetMap run={runs[1]} algorithm={pair[1]} />
      </div>
      <p className={styles.small}>
        A car&rsquo;s fastest route across about 800 m of central Buenos Aires, on real
        OpenStreetMap data. Explored roads are tinted; the route is the thick line.
      </p>
    </Section>
  );
}

export function ArticleNav({ slug }: { slug: string }) {
  const { previous, next } = neighbours(slug);
  return (
    <nav aria-label="More topics" className={styles.more}>
      {previous ? (
        <a href={learnHref(previous.slug)} className={styles.moreLink}>
          <span>← Previous</span>
          <b>{previous.title}</b>
        </a>
      ) : (
        <a href={learnHref()} className={styles.moreLink}>
          <span>← Back to</span>
          <b>Learn home</b>
        </a>
      )}
      {next && (
        <a href={learnHref(next.slug)} className={`${styles.moreLink} ${styles.nextLink}`}>
          <span>Next →</span>
          <b>{next.title}</b>
        </a>
      )}
    </nav>
  );
}

export interface FigureNode {
  id: string;
  x: number;
  y: number;
  /** Shown inside the circle; defaults to the id. */
  label?: string;
}

export interface FigureEdge {
  from: string;
  to: string;
  label?: string;
  /** Drawn with an arrow from `from` to `to`. */
  directed?: boolean;
  /** Drawn thick, in the article's colour. */
  highlight?: boolean;
}

const NODE_RADIUS = 18;

/** A small static graph: circles for nodes, lines (or arrows) for edges. */
export function GraphFigure({
  width,
  height,
  nodes,
  edges,
  label,
  children,
}: {
  width: number;
  height: number;
  nodes: readonly FigureNode[];
  edges: readonly FigureEdge[];
  /** What the picture shows, for screen readers. */
  label: string;
  children?: ReactNode;
}) {
  const at = (id: string) => nodes.find((n) => n.id === id)!;
  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0 0L10 5L0 10z" className={styles.arrowHead} />
          </marker>
        </defs>
        {edges.map((edge) => {
          const a = at(edge.from);
          const b = at(edge.to);
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          // Stop at the circles' edges so arrowheads stay visible.
          const ux = (b.x - a.x) / length;
          const uy = (b.y - a.y) / length;
          const gap = NODE_RADIUS + (edge.directed ? 4 : 0);
          return (
            <g key={`${edge.from}-${edge.to}`}>
              <line
                x1={a.x + ux * NODE_RADIUS}
                y1={a.y + uy * NODE_RADIUS}
                x2={b.x - ux * gap}
                y2={b.y - uy * gap}
                className={edge.highlight ? styles.edgeOn : styles.edge}
                markerEnd={edge.directed ? 'url(#arrow)' : undefined}
              />
              {edge.label && (
                <text
                  x={(a.x + b.x) / 2 - uy * 14}
                  y={(a.y + b.y) / 2 + ux * 14 + 4}
                  textAnchor="middle"
                  className={styles.edgeLabel}
                >
                  {edge.label}
                </text>
              )}
            </g>
          );
        })}
        {nodes.map((node) => (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={NODE_RADIUS} className={styles.node} />
            <text x={node.x} y={node.y + 5} textAnchor="middle" className={styles.nodeLabel}>
              {node.label ?? node.id}
            </text>
          </g>
        ))}
      </svg>
      {children && <figcaption className={styles.small}>{children}</figcaption>}
    </figure>
  );
}
