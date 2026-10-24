import { useMemo } from 'react';
import type { Objective } from '../osm/network';
import { AlgorithmBadge } from '../ui/AlgorithmBadge';
import type { Place } from '../geo/nominatim';
import type { CameraSync } from '../map/cameraSync';
import { explorationColors, type SnapLink } from '../map/explorationLayers';
import { MapCanvas } from '../map/MapCanvas';
import type { LiveTraffic } from '../map/trafficLayers';
import { algoColor, algorithmName, ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { formatCost, formatCount } from '../ui/format';
import { CheckIcon, EditIcon, LinkIcon } from '../ui/icons';
import type { AlgorithmRun } from '../worker/job';
import { finishMarks, totalSteps } from './comparison';
import styles from './CompareView.module.css';
import {
  MAX_SHOWN_MAPS,
  type ExploreAction,
  type ExploreState,
  type RunState,
} from './exploreState';
import { searchStatus } from './narration';
import { PlaybackBar, type PlaybackChange } from './PlaybackBar';
import { ResultsTable } from './ResultsTable';
import { PROVIDER_NAME } from './trafficText';
import { fetchedTime } from './trafficText';
import { TrafficKey, TrafficNotice } from './TrafficViews';
import type { PreparationView, TrafficOutcome } from '../worker/job';
import { algorithms } from '../algorithms';
import { StepLimitNotice } from './AdvancedViews';
import { advancedView } from './advancedRun';

type Ready = Extract<RunState, { status: 'ready' }>;

interface Props {
  state: ExploreState;
  run: Ready;
  phone: boolean;
  sync: CameraSync;
  step: number;
  dispatch(action: ExploreAction): void;
  onEdit(): void;
}

const MODE_LABEL = { car: 'Car', bike: 'Bike', walk: 'Walk' };
const ignore = () => {};

/** Several searches side by side (desktop) or stacked (phone), on one playback clock. */
export function CompareView({ state, run, phone, sync, step, dispatch, onEdit }: Props) {
  const { result, playback, shown } = run;
  const { runs, objective } = result;
  const snaps = useSnapLinks(state.start, state.target, result.snapped);
  const total = totalSteps(runs);
  const onPlayback = (apply: PlaybackChange) => dispatch({ type: 'playback', apply });
  const live = result.traffic.status === 'live' ? result.traffic : null;
  const layer = state.trafficLayer;
  const traffic = useMemo(() => (live ? { live, bands: layer } : null), [live, layer]);
  const trafficParts = (
    <TrafficParts traffic={result.traffic} layer={state.trafficLayer} dispatch={dispatch} />
  );

  const mapFor = (r: AlgorithmRun) => (
    <ComparisonMap
      key={r.algorithm}
      run={r}
      step={step}
      start={state.start}
      target={state.target}
      snaps={snaps}
      sync={sync}
      phone={phone}
      objective={objective}
      traffic={traffic}
      preparation={result.preparation}
      targetNode={result.snapped.target.node}
    />
  );
  const limits = runs.flatMap((r) =>
    r.limit
      ? [<StepLimitNotice key={r.algorithm} limit={r.limit} name={algorithms[r.algorithm].name} />]
      : [],
  );
  const prepared = Boolean(result.preparation.landmarks || result.preparation.hierarchy);

  if (phone) {
    const hidden = runs.map((r) => r.algorithm).filter((id) => !shown.includes(id));
    return (
      <main className={styles.phone} aria-label="Comparison">
        <header className={styles.phoneHeader}>
          <button
            type="button"
            className={styles.iconButton}
            aria-label="Edit setup"
            onClick={onEdit}
          >
            <EditIcon size={17} />
          </button>
          <div className={styles.title}>
            <h1>Comparing {runs.length}</h1>
            <p>
              {state.start?.name} → {state.target?.name} · {MODE_LABEL[result.mode]}
            </p>
          </div>
          <LinkToggle state={state} dispatch={dispatch} iconOnly />
        </header>

        {runs.length > MAX_SHOWN_MAPS && (
          <fieldset className={styles.chips}>
            <legend className={styles.visuallyHidden}>Maps to show, up to {MAX_SHOWN_MAPS}</legend>
            <span className={styles.chipCount} aria-hidden="true">
              Show <span className={styles.mono}>{shown.length}</span>/{runs.length}
            </span>
            <div className={styles.chipRow}>
              {runs.map(({ algorithm }) => {
                const on = shown.includes(algorithm);
                return (
                  <button
                    key={algorithm}
                    type="button"
                    className={styles.chip}
                    style={algoColor(algorithm)}
                    aria-pressed={on}
                    onClick={() => dispatch({ type: 'mapToggled', algorithm })}
                  >
                    {on ? (
                      <CheckIcon size={13} strokeWidth={3} className={styles.chipTick} />
                    ) : (
                      <span className={styles.chipRing} aria-hidden="true" />
                    )}
                    {ALGORITHM_STYLE[algorithm].short}
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        <div className={styles.stack}>
          {runs.filter((r) => shown.includes(r.algorithm)).map(mapFor)}
        </div>

        <section className={styles.panel} aria-label="Playback for all maps">
          <PlaybackBar
            playback={playback}
            total={total}
            onChange={onPlayback}
            variant="compact"
            note={`All ${runs.length} searches`}
          />
        </section>

        <section className={styles.panel} aria-label="Results">
          {limits}
          {trafficParts}
          <ResultsTable
            runs={runs}
            objective={objective}
            step={step}
            variant="compact"
            hidden={hidden}
          />
          <WithoutTraffic traffic={result.traffic} objective={objective} />
        </section>
      </main>
    );
  }

  const marks = finishMarks(runs).map((mark) => ({
    label: ALGORITHM_STYLE[mark.algorithm].badge,
    color: ALGORITHM_STYLE[mark.algorithm].color,
    step: mark.step,
  }));

  return (
    <main className={styles.desktop} aria-label="Comparison">
      <h1 className="visually-hidden">Comparing {runs.length}</h1>
      <div className={styles.grid}>{runs.map(mapFor)}</div>

      <section className={styles.panel} aria-label="Playback for all maps">
        <PlaybackBar
          playback={playback}
          total={total}
          onChange={onPlayback}
          note={
            prepared ? 'one clock for every search, after preparing' : 'one clock for every map'
          }
          marks={marks}
        />
      </section>

      <section className={styles.panel} aria-labelledby="results-title">
        <div className={styles.resultsHeading}>
          <h2 id="results-title">Results</h2>
          <p>Fills in as each search reaches B.</p>
        </div>
        {limits}
        {trafficParts}
        <ResultsTable
          runs={runs}
          objective={objective}
          step={step}
          preparation={result.preparation}
        />
        <WithoutTraffic traffic={result.traffic} objective={objective} />
      </section>
    </main>
  );
}

/** What the results need to say about traffic: whether it was live, or why not. */
function TrafficParts({
  traffic,
  layer,
  dispatch,
}: {
  traffic: TrafficOutcome;
  layer: boolean;
  dispatch(action: ExploreAction): void;
}) {
  const notice = (
    <TrafficNotice outcome={traffic} onCheckKey={() => dispatch({ type: 'trafficDialogOpened' })} />
  );
  if (traffic.status !== 'live') return notice;
  return (
    <div className={styles.traffic}>
      <p className={styles.trafficCaption}>
        With live traffic, {PROVIDER_NAME[traffic.provider]}, {fetchedTime(traffic.fetchedAt)}.
      </p>
      <TrafficKey
        on={layer}
        onToggle={() => dispatch({ type: 'trafficLayerToggled' })}
        clearRoute={Boolean(traffic.story?.changed)}
      />
      {notice}
    </div>
  );
}

/** The best route's cost on clear roads, under the results. */
function WithoutTraffic({ traffic, objective }: { traffic: TrafficOutcome; objective: Objective }) {
  if (traffic.status !== 'live' || !traffic.story) return null;
  const cost = formatCost(traffic.story.clear.cost, objective);
  return (
    <p className={styles.withoutTraffic}>
      <span className={styles.dotted} aria-hidden="true" />
      {objective === 'fastest'
        ? `Without traffic the fastest route takes ${cost}.`
        : `Without closures the shortest route is ${cost}.`}
    </p>
  );
}

/** Thin lines from where A and B were placed to the road nodes the search started and ended at. */
function useSnapLinks(
  start: Place | null,
  target: Place | null,
  snapped: Ready['result']['snapped'],
) {
  return useMemo((): SnapLink[] => {
    if (!start || !target) return [];
    return [
      { from: [start.lon, start.lat], to: [snapped.start.lon, snapped.start.lat] },
      { from: [target.lon, target.lat], to: [snapped.target.lon, snapped.target.lat] },
    ];
  }, [start, target, snapped]);
}

export function LinkToggle({
  state,
  dispatch,
  iconOnly = false,
}: {
  state: ExploreState;
  dispatch(action: ExploreAction): void;
  iconOnly?: boolean;
}) {
  return (
    <button
      type="button"
      className={iconOnly ? styles.iconButton : styles.linkButton}
      aria-pressed={state.mapsLinked}
      aria-label={iconOnly ? 'Maps move together' : undefined}
      onClick={() => dispatch({ type: 'mapsLinkToggled' })}
    >
      <LinkIcon size={iconOnly ? 18 : 16} />
      {!iconOnly && 'Maps move together'}
    </button>
  );
}

interface MapProps {
  run: AlgorithmRun;
  objective: Objective;
  step: number;
  start: Place | null;
  target: Place | null;
  snaps: readonly SnapLink[];
  sync: CameraSync;
  phone: boolean;
  traffic: { live: LiveTraffic; bands: boolean } | null;
  preparation: PreparationView;
  /** The node B snapped to. */
  targetNode: number;
}

// Room for the A and B markers (about 30 px across) and, on phones, the label over the map.
const CARD_PADDING = { top: 40, bottom: 40, left: 40, right: 40 };
const STACKED_PADDING = { top: 52, bottom: 24, left: 32, right: 32 };

function ComparisonMap({
  run,
  step,
  start,
  target,
  snaps,
  sync,
  phone,
  objective,
  traffic,
  preparation,
  targetNode,
}: MapProps) {
  const { algorithm, timeline } = run;
  const { short } = ALGORITHM_STYLE[algorithm];
  const name = algorithmName(algorithm, run.weight);
  // A finished search stops changing, so its map is left alone while the others play on.
  const at = Math.min(step, timeline.steps);
  const colors = useMemo(() => explorationColors(algorithm), [algorithm]);
  const exploration = useMemo(
    () => ({
      timeline,
      step: at,
      colors,
      snaps,
      meetLabel: (m: number) => `Met · best ${formatCost(timeline.meetCost[m]!, objective)}`,
      traffic,
      advanced: advancedView(run, preparation, targetNode),
    }),
    [timeline, at, colors, snaps, objective, traffic, run, preparation, targetNode],
  );
  const status = searchStatus(timeline, step);

  const map = (
    <MapCanvas
      start={start}
      target={target}
      area={null}
      exploration={exploration}
      padding={phone ? STACKED_PADDING : CARD_PADDING}
      draggable={false}
      onMapClick={ignore}
      onPinMoved={ignore}
      sync={sync}
      card={phone ? 'bare' : 'framed'}
      name={`Map: ${name}`}
    />
  );

  if (phone) {
    return (
      <article aria-label={name} className={styles.stacked} style={algoColor(algorithm)}>
        {map}
        <div className={styles.label}>
          <AlgorithmBadge algorithm={algorithm} className={styles.badge} />
          <span className={styles.labelName}>{short}</span>
          <span className={styles.labelStatus}>
            ·{' '}
            {status === 'searching'
              ? 'Searching'
              : status === 'found'
                ? 'Done'
                : status === 'stopped'
                  ? 'Stopped'
                  : 'No route'}
          </span>
        </div>
      </article>
    );
  }

  return (
    <article aria-label={name} className={styles.card} style={algoColor(algorithm)}>
      <header className={styles.cardHeader}>
        <AlgorithmBadge algorithm={algorithm} className={styles.badge} />
        <h2>{name}</h2>
        <span className={styles.cardStatus}>
          {status === 'searching' ? (
            <>
              <span className={styles.dot} aria-hidden="true" />
              Searching
            </>
          ) : (
            <>
              {status === 'found' ? 'Done' : status === 'stopped' ? 'Stopped' : 'No route'} at step{' '}
              <span className={styles.mono}>{formatCount(timeline.steps)}</span>
            </>
          )}
        </span>
      </header>
      <div className={styles.cardMap}>{map}</div>
    </article>
  );
}
