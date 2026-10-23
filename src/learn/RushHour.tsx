import { useState } from 'react';
import { PHONE, useMediaQuery } from '../app/hooks';
import { algoColor } from '../ui/algorithmStyle';
import { rushHour, type Jam } from './diagram';
import { SIX } from './networks';
import styles from './RushHour.module.css';

const JAM: Jam = { road: ['A', 'B'], share: 0.25 };
const BOX = { w: 48, h: 40 };

const onPath = (path: readonly string[], a: string, b: string) =>
  path.some((id, i) => (id === a && path[i + 1] === b) || (id === b && path[i + 1] === a));

/**
 * The six-node network on clear roads and at rush hour, when one road slows to a quarter of its
 * speed. Dijkstra runs for real on both, so the routes and costs shown are what it finds.
 */
export function RushHourFigure() {
  const [jammed, setJammed] = useState(false);
  const phone = useMediaQuery(PHONE);
  const layout = phone ? 'tall' : 'wide';
  const network = SIX;
  const { route, before, costs } = rushHour(network, jammed ? JAM : null);
  const position = (id: string) => network.nodes.find((n) => n.id === id)![layout];
  const costOf = (a: string, b: string) => (costs.get(`${a}–${b}`) ?? costs.get(`${b}–${a}`))!;
  const sum = (path: readonly string[]) =>
    path
      .slice(1)
      .map((to, i) => costOf(path[i]!, to).now)
      .join(' + ');
  const arrow = (path: readonly string[]) => path.join(' → ');
  const isJam = (a: string, b: string) =>
    jammed &&
    ((a === JAM.road[0] && b === JAM.road[1]) || (a === JAM.road[1] && b === JAM.road[0]));

  const xs = network.nodes.map((n) => n[layout][0]);
  const ys = network.nodes.map((n) => n[layout][1]);
  const margin = 24;
  const left = Math.min(...xs) - BOX.w / 2 - margin;
  const top = Math.min(...ys) - BOX.h / 2 - margin;
  const width = Math.max(...xs) - Math.min(...xs) + BOX.w + 2 * margin;
  const height = Math.max(...ys) - Math.min(...ys) + BOX.h + 2 * margin;

  const [ja, jb] = JAM.road;
  const usual = costOf(ja, jb).usual;
  const label = jammed
    ? `Six intersections. ${ja} to ${jb} is jammed and costs ${usual / JAM.share} instead of ${usual}. Dijkstra's best route is now ${route.path.join(', ')}, costing ${route.cost}; on clear roads it was ${before!.path.join(', ')}, costing ${before!.cost}.`
    : `Six intersections on clear roads; Dijkstra's best route ${route.path.join(', ')}, costing ${route.cost}.`;

  return (
    <figure className={styles.figure} style={algoColor('dijkstra')}>
      <div role="group" aria-label="Traffic" className={styles.toggle}>
        <button type="button" aria-pressed={!jammed} onClick={() => setJammed(false)}>
          Clear roads
        </button>
        <button type="button" aria-pressed={jammed} onClick={() => setJammed(true)}>
          <span className={styles.jamSwatch} aria-hidden="true" />
          Rush hour
        </button>
      </div>
      <div className={styles.canvas}>
        <svg
          viewBox={`${left} ${top} ${width} ${height}`}
          className={styles.svg}
          role="img"
          aria-label={label}
        >
          {network.edges.map(([a, b]) => {
            const [x1, y1] = position(a);
            const [x2, y2] = position(b);
            const level = Math.abs(y2 - y1) < Math.abs(x2 - x1);
            const mx = (x1 + x2) / 2 + (level ? 0 : 18);
            const my = (y1 + y2) / 2 + (level ? -14 : 5);
            const cost = costOf(a, b);
            return (
              <g key={`${a}${b}`}>
                {isJam(a, b) && <line x1={x1} y1={y1} x2={x2} y2={y2} className={styles.jam} />}
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={styles.road}
                  data-route={onPath(route.path, a, b) || undefined}
                />
                <text x={mx} y={my} className={styles.cost} textAnchor={level ? 'middle' : 'start'}>
                  {cost.now !== cost.usual ? (
                    <>
                      <tspan className={styles.was}>{cost.usual}</tspan> {cost.now}
                    </>
                  ) : (
                    cost.now
                  )}
                </text>
              </g>
            );
          })}
          {before && (
            <polyline
              points={before.path.map((id) => position(id).join(',')).join(' ')}
              className={styles.before}
              // Beside the roads, on the side away from their cost labels.
              transform={layout === 'wide' ? 'translate(0 14)' : 'translate(-14 0)'}
            />
          )}
          {network.nodes.map(({ id }) => {
            const [x, y] = position(id);
            return (
              <g
                key={id}
                className={styles.node}
                data-on-route={route.path.includes(id) || undefined}
                data-target={id === network.target || undefined}
              >
                <rect x={x - BOX.w / 2} y={y - BOX.h / 2} width={BOX.w} height={BOX.h} rx={8} />
                <text x={x} y={y} textAnchor="middle" dominantBaseline="central">
                  {id}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <ul className={styles.legend}>
        <li>
          <span className={styles.routeSwatch} aria-hidden="true" />
          Dijkstra’s route{jammed ? ' now' : ''} · {route.cost}
        </li>
        {before && (
          <li>
            <span className={styles.beforeSwatch} aria-hidden="true" />
            Its route on clear roads · {before.cost}
          </li>
        )}
        {jammed && (
          <li>
            <span className={styles.jamSwatch} aria-hidden="true" />
            Jammed: a quarter of its usual speed
          </li>
        )}
      </ul>
      <figcaption className={styles.caption}>
        {jammed
          ? `At rush hour ${ja}–${jb} moves at a quarter of its speed, so it costs ${usual} ÷ ${JAM.share} = ${usual / JAM.share} and the way ${layout === 'wide' ? 'along the top' : 'down the left'} now costs ${before!.costNow}. The same Dijkstra, run on the new costs, takes ${arrow(route.path)}: ${sum(route.path)} = ${route.cost}.`
          : `On clear roads the best way from ${network.source} to ${network.target} is ${arrow(route.path)}: ${sum(route.path)} = ${route.cost}.`}
      </figcaption>
    </figure>
  );
}
