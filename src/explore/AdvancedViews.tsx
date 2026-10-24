import type { ReactNode } from 'react';
import { learnHref } from '../app/routes';
import type { Objective } from '../osm/network';
import { labelOf, type NodeLabels } from '../osm/places';
import type { Rounds } from '../playback/rounds';
import { climbStopCheck, meetingSplit } from '../playback/sides';
import { meetingAt, type Timeline } from '../playback/timeline';
import { algoColor } from '../ui/algorithmStyle';
import { formatCost, formatCount, formatMs } from '../ui/format';
import { InfoIcon, WarningIcon } from '../ui/icons';
import type { HierarchyView, StepLimitReached } from '../worker/job';
import type { LandmarkView } from '../worker/preparations';
import styles from './AdvancedViews.module.css';
import type { RunView } from './Inspector';
import inspector from './Inspector.module.css';
import { describeClimbStop, describeStep } from './narration';

interface Props {
  run: RunView;
  step: number;
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${formatCount(n)} ${n === 1 ? one : many}`;

const times = (n: number) => (n === 1 ? 'once' : n === 2 ? 'twice' : `${formatCount(n)} times`);

/** A time or a distance, as the inspector names it: "time" for the fastest route. */
const measureOf = (objective: Objective) => (objective === 'fastest' ? 'time' : 'distance');

function Tile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={inspector.tile}>
      <dt>{label}</dt>
      <dd>{value}</dd>
      {sub !== undefined && <dd className={styles.sub}>{sub}</dd>}
    </div>
  );
}

/** A note under the inspector's account, with a link to read more in Learn. */
export function LearnNote({
  children,
  topic,
  link,
}: {
  children: ReactNode;
  topic: string;
  link: string;
}) {
  return (
    <p className={styles.note}>
      <InfoIcon size={16} />
      <span>
        {children} <a href={learnHref(topic)}>{link}</a>
      </span>
    </p>
  );
}

// ---- Bellman-Ford ------------------------------------------------------------------------

export function RoundTiles({ run, step, rounds }: Props & { rounds: Rounds }) {
  const { timeline: t, objective } = run;
  const distinct = rounds.distinctBy[step]!;
  const best = rounds.targetCostAt[step]!;
  const done = step >= t.steps && !t.stopped;
  return (
    <dl className={inspector.tiles}>
      <Tile
        label="Expanded"
        value={formatCount(step)}
        sub={`${plural(distinct, 'different node')}`}
      />
      <Tile
        label="Corrections"
        value={formatCount(step - distinct)}
        sub="expanded again, cheaper"
      />
      <Tile
        label="Waiting"
        value={formatCount(t.frontierSizeAt[step]!)}
        sub={done ? 'queue empty' : `for round ${rounds.roundAt[step]! + 1}`}
      />
      <Tile
        label="Best to B so far"
        value={Number.isFinite(best) ? formatCost(best, objective) : '—'}
        sub={!Number.isFinite(best) ? 'not reached yet' : done ? 'final' : 'may still improve'}
      />
    </dl>
  );
}

export function RoundNow({
  run,
  step,
  names,
  rounds,
}: Props & { names: NodeLabels; rounds: Rounds }) {
  const { timeline: t, objective } = run;
  const cost = (v: number) => formatCost(v, objective);
  const previous = rounds.previousExpansion[step]!;
  const first = rounds.targetFirst;
  const waiting = first && step >= first.step && step < t.steps;
  const improved = rounds.targetImprovedBy[step]!;
  return (
    <>
      <section className={inspector.step} aria-labelledby="round-step">
        <h3 id="round-step">Step {formatCount(step)}</h3>
        <p>{describeStep(t, step, 'bellmanford', objective)}</p>
      </section>
      {waiting && (
        <section className={styles.card} aria-labelledby="round-stop">
          <h3 id="round-stop">
            <span className={inspector.dot} aria-hidden="true" />
            Why it can't stop at B
          </h3>
          <p>
            B was first reached in round {first.round}, at{' '}
            <span className={styles.mono}>{cost(first.cost)}</span>. Bellman-Ford doesn't take nodes
            cheapest first, so a later round can still find a quicker way
            {improved > 0 ? `, and it already has, ${times(improved)}` : ''}. It stops only after a
            round in which nothing gets cheaper.
          </p>
        </section>
      )}
      {previous > 0 && step < t.steps && (
        <section aria-labelledby="round-corrected">
          <h3 id="round-corrected" className={inspector.eyebrow}>
            Corrected this step
          </h3>
          <p className={styles.text}>
            <b>{labelOf(names, t.expandedNode[step]!)}</b> was expanded in round{' '}
            {rounds.roundAt[previous]} at{' '}
            <span className={styles.mono}>{cost(t.expandedCost[previous]!)}</span>. In round{' '}
            {rounds.roundAt[step]} a quicker way turned up,{' '}
            <span className={styles.mono}>{cost(t.expandedCost[step]!)}</span>, so now its roads are
            checked again with the new {measureOf(objective)}. Dijkstra never needs this: it takes
            each node only once its {measureOf(objective)} is final.
          </p>
        </section>
      )}
      <LearnNote topic="bellmanford" link="When negative costs happen">
        All that rechecking buys one thing: Bellman-Ford still works when a road can cost less than
        nothing, where Dijkstra goes wrong. Streets never do, so here it is just slow.
      </LearnNote>
    </>
  );
}

/** Bellman-Ford stopped at the step limit: how far it got, and how far it had to go. */
export function StepLimitNotice({
  limit,
  name,
  onWatch,
}: {
  limit: StepLimitReached;
  name: string;
  onWatch?(): void;
}) {
  const ratio = Math.round(limit.needed / Math.max(1, limit.dijkstra));
  return (
    <div role="status" className={styles.limit}>
      <WarningIcon size={18} />
      <div className={styles.limitBody}>
        <p>
          <b>
            {name} stopped at {formatCount(limit.steps)} steps.
          </b>{' '}
          To finish on these roads it needs {formatCount(limit.needed)}, {ratio} times Dijkstra's
          whole search, which is too much to replay. Move A and B closer together, under about 4 km,
          to watch it finish.
        </p>
        {onWatch && (
          <button type="button" className={styles.button} onClick={onWatch}>
            Watch the first {formatCount(limit.steps)}
          </button>
        )}
      </div>
    </div>
  );
}

// ---- ALT ---------------------------------------------------------------------------------

/** The landmarks' bounds at a step, largest first, with the straight line among them. */
function boundsAt(run: RunView, step: number) {
  const steps = run.landmarkSteps!;
  const count = steps.bounds.length / (run.timeline.steps + 1);
  const bounds = Array.from({ length: count }, (_, i) => ({
    label: `Landmark ${i + 1}`,
    value: steps.bounds[step * count + i]!,
  }));
  return {
    count,
    bounds: bounds.sort((a, b) => b.value - a.value),
    straight: steps.straight[step]!,
  };
}

export function AltTiles({ run, step }: Props) {
  const { timeline: t, objective } = run;
  const best = run.landmarkSteps?.best[step] ?? -1;
  return (
    <dl className={inspector.tiles}>
      <Tile label="Expanded" value={formatCount(step)} />
      <Tile label="In frontier" value={formatCount(t.frontierSizeAt[step]!)} />
      <Tile
        label="Cost so far · g"
        value={formatCost(t.expandedCost[step]!, objective)}
        sub="from A"
      />
      <Tile
        label="Estimate left · h"
        value={formatCost(t.expandedEstimate[step]!, objective)}
        sub={step > 0 && best >= 0 ? `from landmark ${best + 1}` : 'to B'}
      />
    </dl>
  );
}

export function AltNow({ run, step, landmarks }: Props & { landmarks?: LandmarkView }) {
  const { timeline: t, objective } = run;
  const steps = run.landmarkSteps;
  const cost = (v: number) => formatCost(v, objective);
  const best = steps && step > 0 ? steps.best[step]! : -1;
  const measure = measureOf(objective);
  return (
    <>
      <section className={inspector.step} aria-labelledby="alt-step">
        <h3 id="alt-step">Step {formatCount(step)}</h3>
        <p>{describeStep(t, step, 'alt', objective)}</p>
      </section>
      {steps && step > 0 && step <= t.steps && (
        <section className={styles.card} aria-labelledby="alt-estimate">
          <h3 id="alt-estimate">
            <span className={styles.diamond} aria-hidden="true" />
            How the estimate was worked out
          </h3>
          {best < 0 ? (
            <p>No landmark gives more than nothing here, so the estimate is 0.</p>
          ) : (
            <>
              <p>
                {steps.via[step]
                  ? `Landmark ${best + 1} lies behind this node. Going landmark ${best + 1} → here → B is one way to reach B, so it can't beat the quickest way from landmark ${best + 1} to B. Take off the part to here, and what's left is the least here → B can take:`
                  : `Landmark ${best + 1} lies beyond B. Going here → B → landmark ${best + 1} is one way to reach landmark ${best + 1}, so it can't beat the quickest way there. Take off the part from B, and what's left is the least here → B can take:`}
              </p>
              <div className={styles.sum}>
                <span>
                  {steps.via[step] ? `landmark ${best + 1} → B` : `here → landmark ${best + 1}`}
                </span>
                <span className={styles.mono}>{cost(steps.first[step]!)}</span>
                <span>
                  − {steps.via[step] ? `landmark ${best + 1} → here` : `B → landmark ${best + 1}`}
                </span>
                <span className={styles.mono}>{cost(steps.second[step]!)}</span>
                <span className={styles.total}>{measure} left ≥</span>
                <span className={`${styles.mono} ${styles.total}`}>
                  {cost(steps.first[step]! - steps.second[step]!)}
                </span>
              </div>
            </>
          )}
          <p className={styles.muted}>
            {objective === 'fastest' ? 'Both times' : 'Both distances'} were measured while
            preparing. The straight line would only have guessed{' '}
            <span className={styles.mono}>{cost(steps.straight[step]!)}</span>
            {objective === 'fastest' ? ', at the top speed.' : '.'}
          </p>
        </section>
      )}
      {steps && step > 0 && step <= t.steps && <BestLandmarks run={run} step={step} />}
      <LearnNote topic="alt" link="How landmarks work">
        The estimate never overestimates, so ALT finds the same best route as Dijkstra.
        {landmarks &&
          (landmarks.reused
            ? ' The landmarks were chosen for your last run on these roads, and reused.'
            : ` Choosing the landmarks took ${formatMs(landmarks.ms)}, once for these roads.`)}
      </LearnNote>
    </>
  );
}

function BestLandmarks({ run, step }: Props) {
  const { bounds, count, straight } = boundsAt(run, step);
  const cost = (v: number) => formatCost(v, run.objective);
  const top = bounds.slice(0, 2);
  const rest = bounds.slice(2);
  const scale = Math.max(straight, bounds[0]?.value ?? 0, 1e-9);
  const rows = [
    ...top.map((b, i) => ({ ...b, best: i === 0 && b.value > 0 })),
    { label: 'Straight line', value: straight, best: false },
  ];
  return (
    <section aria-labelledby="alt-best">
      <h3 id="alt-best" className={inspector.eyebrow}>
        Best of the {count} landmarks
      </h3>
      <ul className={styles.bars}>
        {rows.map((row) => (
          <li key={row.label} data-best={row.best || undefined}>
            <span>{row.label}</span>
            <span className={styles.bar} aria-hidden="true">
              <span style={{ width: `${(100 * Math.max(0, row.value)) / scale}%` }} />
            </span>
            <span className={styles.mono}>{cost(Math.max(0, row.value))}</span>
          </li>
        ))}
        {rest.length > 0 && (
          <li>
            <span>{rest.length} others</span>
            <span className={styles.bar} aria-hidden="true" />
            <span className={styles.mono}>≤ {cost(Math.max(0, rest[0]!.value))}</span>
          </li>
        )}
      </ul>
      <p className={styles.muted}>
        ALT keeps the largest: every one is a safe lower bound, so the largest is the closest to the
        truth.
      </p>
    </section>
  );
}

/** ALT's Prepare tab: the landmarks, in the order they were chosen, and why each. */
export function LandmarksPrepared({
  landmarks,
  names,
  objective,
  graphNodes,
}: {
  landmarks: LandmarkView;
  names: NodeLabels;
  objective: Objective;
  /** How many nodes the times were measured to and from. */
  graphNodes?: number;
}) {
  const cost = (v: number) => formatCost(v, objective);
  return (
    <div className={inspector.inspector}>
      <header>
        <p className={inspector.eyebrow}>Inspector</p>
        <h2 className={inspector.title}>
          Preparing: {landmarks.node.length} landmarks, chosen farthest first
        </h2>
      </header>
      <p className={styles.text}>
        The first is the node farthest from A, there and back; each next one the node farthest from
        every landmark so far. That puts them around the edge of the map, behind A or beyond B for
        most trips. Then the {measureOf(objective)} to and from every
        {graphNodes ? ` one of the ${formatCount(graphNodes)} nodes` : ' node'} is measured for
        each.
      </p>
      <ol className={styles.landmarks}>
        {Array.from(landmarks.node, (node, i) => (
          <li key={i}>
            <span className={styles.number} aria-hidden="true">
              {i + 1}
            </span>
            <span className={styles.place}>
              <span>{labelOf(names, node)}</span>
              <span className={styles.muted}>
                {cost(landmarks.spread[i]!)} there and back from{' '}
                {i === 0 ? 'A' : 'the nearest landmark before it'}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <LearnNote topic="alt" link="How landmarks work">
        {landmarks.reused
          ? `Chosen for your last run on these roads, in ${formatMs(landmarks.ms)}, and reused this time.`
          : `Your browser chose them and measured every ${measureOf(objective)} in ${formatMs(landmarks.ms)}: two Dijkstra searches over the whole map per landmark.`}
      </LearnNote>
    </div>
  );
}

// ---- Contraction hierarchies ---------------------------------------------------------------

/** How many of the first `step` steps each side took. */
function stepsBySide(t: Timeline, step: number) {
  let fromB = 0;
  for (let s = 1; s <= step; s++) fromB += t.expandedSide[s]!;
  return [step - fromB, fromB] as const;
}

export function ClimbTiles({ run, step, hierarchy }: Props & { hierarchy?: HierarchyView }) {
  const { timeline: t, objective } = run;
  const [fromA, fromB] = stepsBySide(t, step);
  const done = step >= t.steps;
  const meeting = meetingAt(t, step);
  return (
    <dl className={inspector.tiles}>
      <Tile
        label="Expanded"
        value={formatCount(step)}
        sub={`${formatCount(fromA)} from A, ${formatCount(fromB)} from B`}
      />
      {done && t.route ? (
        <Tile
          label={objective === 'fastest' ? 'Route time' : 'Route length'}
          value={formatCost(t.route.cost, objective)}
          sub={objective === 'fastest' ? `${(t.route.meters / 1000).toFixed(1)} km` : undefined}
        />
      ) : (
        <Tile
          label="Best route so far"
          value={meeting < 0 ? '—' : formatCost(t.meetCost[meeting]!, objective)}
          sub={meeting < 0 ? 'once the sides meet' : 'through the meeting point'}
        />
      )}
      {hierarchy && (
        <Tile
          label="Preparing"
          value={hierarchy.reused ? '0 ms' : formatMs(hierarchy.ms)}
          sub={
            hierarchy.reused ? `reused, made in ${formatMs(hierarchy.ms)}` : 'once for these roads'
          }
        />
      )}
      {done && run.climb ? (
        <Tile
          label="Shortcuts on the route"
          value={formatCount(run.climb.shortcuts)}
          sub={`unpacked into ${plural(run.climb.roads, 'road')}`}
        />
      ) : (
        <Tile label="In frontiers" value={formatCount(t.frontierSizeAt[step]!)} />
      )}
    </dl>
  );
}

export function ClimbNow({
  run,
  step,
  names,
  hierarchy,
}: Props & { names: NodeLabels; hierarchy?: HierarchyView }) {
  const { timeline: t, objective } = run;
  const cost = (v: number) => formatCost(v, objective);
  const done = step >= t.steps;
  const meeting = meetingAt(t, step);
  const check = climbStopCheck(t, step);
  const side = t.expandedSide[step]!;
  return (
    <>
      <section className={inspector.step} aria-labelledby="climb-step">
        <h3 id="climb-step">
          {step > 0 && !done
            ? `Step ${formatCount(step)} · from ${side ? 'B' : 'A'}`
            : `Step ${formatCount(step)}`}
        </h3>
        <p>{describeStep(t, step, 'ch', objective)}</p>
      </section>
      {meeting >= 0 && (
        <section className={styles.card} aria-labelledby="climb-met">
          <h3 id="climb-met">
            <span className={styles.meet} aria-hidden="true" />
            {done ? 'They met at' : 'Best meeting so far:'} {labelOf(names, t.meetNode[meeting]!)}
          </h3>
          {done ? (
            <p>
              Both sides only ever climbed to more important nodes: from A going forward, from B
              going backward. The best route goes up to its most important node and down again, so
              that is where they met.
              {run.climb && run.climb.longest > 1
                ? ` Shortcuts let each climb skip the side streets: the longest one here stands for ${formatCount(run.climb.longest)} roads.`
                : ''}
            </p>
          ) : (
            <MeetingLine t={t} meeting={meeting} cost={cost} />
          )}
        </section>
      )}
      {done ? (
        <section aria-labelledby="climb-stop">
          <h3 id="climb-stop" className={inspector.eyebrow}>
            Why it stopped
          </h3>
          <p className={styles.text}>
            Unlike bidirectional Dijkstra, meeting isn’t enough. Each side keeps going until its
            cheapest waiting node costs at least the best route,{' '}
            <span className={styles.mono}>{t.route ? cost(t.route.cost) : '—'}</span>: after that,
            nothing it reaches could do better.
          </p>
        </section>
      ) : (
        <section className={styles.card} aria-labelledby="climb-check">
          <h3 id="climb-check">Can it stop yet?</h3>
          <p>{describeClimbStop(check, objective)}</p>
        </section>
      )}
      {hierarchy?.reused && (
        <p className={styles.reused}>
          Same roads as your last run, so the shortcuts made then are used again: this time
          preparing took <span className={styles.mono}>0 ms</span>. The Prepare tab still replays
          how they were made.
        </p>
      )}
      <LearnNote topic="ch" link="How contraction hierarchies work">
        {run.climb
          ? `Same route as Dijkstra, which expanded ${formatCount(run.climb.dijkstra)} nodes for it. `
          : ''}
        Shortcuts keep every cheapest distance, so the climb is exact.
      </LearnNote>
    </>
  );
}

function MeetingLine({
  t,
  meeting,
  cost,
}: {
  t: Timeline;
  meeting: number;
  cost(v: number): string;
}) {
  const { fromA, toB } = meetingSplit(t, meeting);
  return (
    <p>
      {cost(fromA)} from A + {cost(toB)} to B = {cost(fromA + toB)}, found at step{' '}
      {formatCount(t.meetStep[meeting]!)}. Each side only climbs, so a cheaper meeting may still be
      ahead of either.
    </p>
  );
}

/** Contraction at a step: which node goes, what it needed, and why it went now. */
export function ContractionInspector({
  hierarchy,
  step,
  names,
  objective,
  compact = false,
}: {
  hierarchy: HierarchyView;
  step: number;
  names: NodeLabels;
  objective: Objective;
  /** Phones: no header or tiles, which the card over the map already shows. */
  compact?: boolean;
}) {
  const { replay } = hierarchy;
  const share = Math.round((100 * step) / replay.steps);
  const made = replay.shortcutsBy[step]!;
  return (
    <div className={inspector.inspector}>
      {!compact && (
        <>
          <header>
            <p className={inspector.eyebrow}>Inspector</p>
            <h2 className={inspector.title}>
              Preparing: contracting the map, least important nodes first
            </h2>
          </header>
          <dl className={inspector.tiles}>
            <Tile
              label="Contracted"
              value={`${share}%`}
              sub={`${formatCount(step)} of ${formatCount(replay.steps)}`}
            />
            <Tile
              label="Shortcuts added"
              value={formatCount(made)}
              sub={`on top of ${formatCount(replay.roads)} roads`}
            />
          </dl>
        </>
      )}
      {step === 0 ? (
        <section className={styles.card} aria-label="Start">
          <h3>Nothing contracted yet</h3>
          <p>
            Contraction takes the nodes out one at a time, least important first, adding a shortcut
            wherever taking one out would make a route longer.
          </p>
        </section>
      ) : (
        <Contracting hierarchy={hierarchy} step={step} names={names} objective={objective} />
      )}
      <LearnNote topic="ch" link="How contraction works">
        {hierarchy.reused
          ? `These shortcuts were made for your last run on the same roads, in ${formatMs(hierarchy.ms)}, and reused this time. Here they're replayed so you can watch.`
          : `Your browser contracted all ${formatCount(replay.steps)} nodes in ${formatMs(hierarchy.ms)}; it's slowed down here so you can watch. It happens once for these roads, then every route on them reuses it.`}
      </LearnNote>
    </div>
  );
}

/** Up to this many of a contraction's shortcuts are listed. */
const LISTED = 4;

function Contracting({
  hierarchy: { replay },
  step,
  names,
  objective,
}: {
  hierarchy: HierarchyView;
  step: number;
  names: NodeLabels;
  objective: Objective;
}) {
  const i = step - 1;
  const ways = replay.ways[i]!;
  const first = replay.shortcutsBy[i]!;
  const needed = replay.shortcutsBy[step]! - first;
  const witnessed = ways - needed;
  const node = labelOf(names, replay.node[i]!);
  const importance = needed - replay.degree[i]! + replay.gone[i]!;
  const listed = Array.from({ length: Math.min(needed, LISTED) }, (_, k) => first + k);
  const verdict =
    ways === 0
      ? 'No way runs through it, from one neighbour to another, so it goes without a shortcut.'
      : `Taking it out would cut ${plural(ways, 'way')} through it.${
          witnessed > 0
            ? ` For ${witnessed === ways ? (ways === 1 ? 'it' : 'all of them') : formatCount(witnessed)} a short search found another way at least as ${objective === 'fastest' ? 'quick' : 'short'}, a witness, so ${witnessed === 1 ? 'it needs' : 'they need'} nothing.`
            : ''
        }${
          needed === 0
            ? ''
            : needed === 1
              ? witnessed > 0
                ? ' The last one needs a shortcut:'
                : ' It needs a shortcut:'
              : ` ${witnessed > 0 ? 'The other' : 'All'} ${formatCount(needed)} need shortcuts:`
        }`;
  return (
    <>
      <section className={styles.card} aria-labelledby="contracting">
        <h3 id="contracting">
          <span className={styles.ring} aria-hidden="true" />
          Contracting {node}
        </h3>
        <p>{verdict}</p>
        {listed.length > 0 && (
          <ul className={styles.shortcuts}>
            {listed.map((s) => (
              <li key={s}>
                <span className={styles.shortcut} aria-hidden="true" />
                <span className={styles.place}>
                  {labelOf(names, replay.shortcutFrom[s]!)} →{' '}
                  {labelOf(names, replay.shortcutTo[s]!)}
                </span>
                <span className={styles.mono}>
                  {formatCost(replay.shortcutWeight[s]!, objective)}
                </span>
              </li>
            ))}
          </ul>
        )}
        {needed > LISTED && (
          <p className={styles.muted}>…and {formatCount(needed - LISTED)} more.</p>
        )}
      </section>
      <section aria-labelledby="contract-why">
        <h3 id="contract-why" className={inspector.eyebrow}>
          Why this node now
        </h3>
        <p className={styles.text}>
          It had the lowest importance left: shortcuts it needs, minus roads it removes, plus
          neighbours already gone.
        </p>
        <p className={styles.formula}>
          <span className={styles.muted}>importance =</span> {needed} − {replay.degree[i]} +{' '}
          {replay.gone[i]} = {importance < 0 ? `−${-importance}` : importance}
        </p>
      </section>
    </>
  );
}

/** "Prepare" and "Search": the two parts of a run that prepares first. */
export function PartTabs({
  part,
  onPart,
  reused,
  done,
}: {
  part: 'prepare' | 'search';
  onPart(part: 'prepare' | 'search'): void;
  reused?: boolean;
  /** Preparing has been watched to the end, or happened before the search anyway. */
  done?: boolean;
}) {
  const tab = (id: 'prepare' | 'search', number: number, label: string, extra?: ReactNode) => (
    <button
      type="button"
      role="tab"
      aria-selected={part === id}
      className={styles.partTab}
      onClick={() => onPart(id)}
    >
      <span className={styles.partNumber} aria-hidden="true">
        {number}
      </span>
      {label}
      {extra}
    </button>
  );
  return (
    <div role="tablist" aria-label="Part of the run" className={styles.partTabs}>
      {tab(
        'prepare',
        1,
        'Prepare',
        reused ? <span className={styles.pill}>reused</span> : done ? <CheckMark /> : null,
      )}
      {tab('search', 2, 'Search')}
    </div>
  );
}

function CheckMark() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--ok)"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label="done"
      role="img"
    >
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/** What the marks on the map mean, for each advanced algorithm. */
export function AdvancedMapKey({ run, part }: { run: RunView; part: 'prepare' | 'search' }) {
  const items: [ReactNode, string][] =
    run.algorithm === 'bellmanford'
      ? [
          [<span key="a" className={styles.keyLine} data-dim />, 'Earlier rounds'],
          [<span key="b" className={styles.keyLine} />, 'This round'],
          [
            <span key="c" className={styles.keyRing} />,
            'Corrected: got cheaper after it was expanded',
          ],
        ]
      : run.algorithm === 'alt'
        ? [
            [<span key="a" className={styles.keyLine} />, 'Explored'],
            [<span key="b" className={styles.keyDot} />, 'Frontier'],
            [<span key="c" className={styles.keyDiamond} />, 'Landmark'],
            [
              <span key="d" className={styles.keyDiamond} data-best />,
              'Landmark behind the estimate now',
            ],
          ]
        : part === 'prepare'
          ? [
              [<span key="a" className={styles.keyDot} data-grey />, 'Not contracted yet'],
              [<span key="b" className={styles.keyDot} data-big />, 'Important: left for last'],
              [<span key="c" className={styles.keyLine} data-gold />, 'Shortcut'],
              [<span key="d" className={styles.keyRing} data-white />, 'Being contracted'],
            ]
          : [
              [<span key="a" className={styles.keyLine} data-gold />, 'Climb from A'],
              [<span key="b" className={styles.keyLine} />, 'Climb from B'],
              [<span key="c" className={styles.keyDiamondPlain} />, 'Where they met'],
              [<span key="d" className={styles.keyRoute} />, 'Route, shortcuts unpacked'],
              [<span key="e" className={styles.keyDot} data-gold />, 'Most important nodes'],
            ];
  return (
    <ul aria-label="Map key" className={styles.mapKey} style={algoColor(run.algorithm)}>
      {items.map(([mark, label]) => (
        <li key={label}>
          {mark}
          {label}
        </li>
      ))}
    </ul>
  );
}
