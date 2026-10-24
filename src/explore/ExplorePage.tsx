import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import type { Timeline } from '../playback/timeline';
import { formatCost, formatCount, formatMs } from '../ui/format';
import { algorithms } from '../algorithms';
import { PHONE, useAnimationClock, useElementHeight, useMediaQuery, useOnline } from '../app/hooks';
import { OfflineChip } from '../app/Connection';
import { parseHash } from '../app/routes';
import { useServices, type Services } from '../app/services';
import { useRunOpen } from '../app/pwa';
import { TopBar } from '../app/TopBar';
import { SkipLink } from '../ui/SkipLink';
import type { Place } from '../geo/nominatim';
import type { NodeLabels } from '../osm/places';
import { createCameraSync } from '../map/cameraSync';
import { explorationColors } from '../map/colors';
import type { SnapLink } from '../map/explorationLayers';
import { LazyMapCanvas as MapCanvas } from '../map/LazyMapCanvas';
import type { Padding } from '../map/MapCanvas';
import { boxAround, searchArea, type BBox } from '../osm/area';
import { covers, type SavedArea } from '../osm/saved';
import { tick, type PlaybackState } from '../playback/playback';
import type { RunPart } from './exploreState';
import { ChevronDownIcon, ChevronUpIcon, CloudOffIcon, EditIcon, PointBadge } from '../ui/icons';
import type { RunningJob } from '../worker/client';
import { CompareView, LinkToggle } from './CompareView';
import styles from './ExplorePage.module.css';
import {
  exploreReducer,
  initialExplore,
  MAX_ALGORITHMS,
  type ExploreAction,
  type ExploreState,
  type Role,
} from './exploreState';
import { Inspector, RunCard, type RunView } from './Inspector';
import { AdvancedMapKey, ContractionInspector, LandmarksPrepared, PartTabs } from './AdvancedViews';
import { advancedLine, advancedView, preparationsOf, roundJump, roundsOf } from './advancedRun';
import type { HierarchyView } from '../worker/job';
import { pause, play, seek } from '../playback/playback';
import { MapKey, StopMeterLine } from './BothWaysViews';
import { describeStep } from './narration';
import { PlanPanel } from './PlanPanel';
import { PlaybackBar } from './PlaybackBar';
import { ErrorPanel, LoadingPanel } from './StatusPanels';
import { activeSource } from '../traffic/settings';
import type { TrafficOutcome } from '../worker/job';
import { TrafficDialog } from './TrafficDialog';
import { PROVIDER_NAME } from './trafficText';
import { fetchedTime, trafficSummary } from './trafficText';
import { SlowDrawingNotice } from './SlowDrawingNotice';
import { TrafficKey, TrafficNotice } from './TrafficViews';
import { isSampleRoute } from '../osm/sampleRoute';

const MODE_LABEL = { car: 'Car', bike: 'Bike', walk: 'Walk' };
const OBJECTIVE_LABEL = { fastest: 'Fastest', shortest: 'Shortest' };

function previewArea(start: Place | null, target: Place | null): BBox | null {
  if (!start || !target) return null;
  try {
    return searchArea(start, target);
  } catch {
    return null;
  }
}

/** The saved area A and B are in, if any: offline, its streets are the ones a run uses. */
function savedAreaAround(areas: SavedArea[], start: Place | null, target: Place | null) {
  if (!start || !target) return undefined;
  const ends = boxAround(start, target);
  return areas.find((area) => covers(area.box, ends));
}

/** The routes whose streets are on this device, fetched while offline and after each run. */
function useSavedAreas(client: Services['searchClient'], offline: boolean, runStatus: string) {
  const [saved, setSaved] = useState<{ areas: SavedArea[]; now: number }>({ areas: [], now: 0 });
  useEffect(() => {
    if (!offline) return;
    let current = true;
    void client.savedAreas().then((areas) => current && setSaved({ areas, now: Date.now() }));
    return () => {
      current = false;
    };
  }, [client, offline, runStatus]);
  const forget = (area: SavedArea) =>
    void client.forgetArea(area.key).then((areas) => setSaved({ areas, now: Date.now() }));
  return { ...saved, forget };
}

/** Map space hidden behind panels, kept clear when framing A, B or the download area. */
/** Algorithms linked to from Learn (`#/?algorithms=astar`) are ticked from the start. */
function startingState(): ExploreState {
  const location = parseHash(window.location.hash);
  return location.page === 'explore' && location.algorithms
    ? { ...initialExplore, algorithms: location.algorithms.slice(0, MAX_ALGORITHMS) }
    : initialExplore;
}

/** What the loading panel says is being run. */
function runningLabel(chosen: ExploreState['algorithms']) {
  return chosen.length === 1 ? algorithms[chosen[0]!].name : `${chosen.length} algorithms`;
}

function mapPadding(phone: boolean, watching: boolean, sheetHeight: number): Padding {
  if (!phone) return { top: 90, bottom: watching ? 150 : 60, left: 60, right: 60 };
  if (watching) return { top: 150, bottom: 250, left: 30, right: 30 };
  const sheet = sheetHeight || Math.round(window.innerHeight * 0.5);
  return { top: 160, bottom: sheet + 16, left: 30, right: 30 };
}

export function ExplorePage() {
  const { geocoder, searchClient, traffic } = useServices();
  const [state, dispatch] = useReducer(exploreReducer, undefined, () => ({
    ...startingState(),
    traffic: traffic.load(),
  }));
  useEffect(() => traffic.save(state.traffic), [traffic, state.traffic]);
  const online = useOnline();
  // Traffic only changes cars' roads, so other modes never spend the user's quota.
  const trafficSource = state.mode === 'car' && online ? activeSource(state.traffic) : undefined;
  const phone = useMediaQuery(PHONE);
  const job = useRef<RunningJob | null>(null);
  const planSheet = useRef<HTMLElement>(null);
  const planSheetHeight = useElementHeight(planSheet);
  const run = state.run;
  const watching = run.status === 'ready';
  const saved = useSavedAreas(searchClient, !online, run.status);
  const offline = online
    ? undefined
    : { areas: saved.areas, now: saved.now, onForget: saved.forget };
  const savedArea = online ? undefined : savedAreaAround(saved.areas, state.start, state.target);
  useRunOpen(watching);
  const comparing = watching && run.result.runs.length > 1;
  const [sync] = useState(createCameraSync);
  useEffect(() => sync.setLinked(state.mapsLinked), [sync, state.mapsLinked]);

  /** Runs the planned route, or `route` when given (the sample, chosen in the same click). */
  function startRun(route?: Pick<ExploreState, 'start' | 'target' | 'algorithms'>) {
    const { start, target, algorithms } = route ?? state;
    if (!start || !target) return;
    dispatch({ type: 'runRequested' });
    const running = searchClient.run(
      {
        start,
        target,
        names: { start: start.name, target: target.name },
        mode: state.mode,
        objective: state.objective,
        algorithms,
        astarWeight: state.astarWeight,
        sample: isSampleRoute(start, target),
        traffic: trafficSource,
      },
      (stage, server) => {
        if (job.current === running) dispatch({ type: 'runProgressed', stage, server });
      },
      (done, total) => {
        if (job.current === running) dispatch({ type: 'trafficProgressed', done, total });
      },
      (progress) => {
        if (job.current === running) dispatch({ type: 'prepareProgressed', progress });
      },
    );
    job.current = running;
    running.result.then(
      (result) => job.current === running && dispatch({ type: 'runSucceeded', result }),
      (error) => job.current === running && dispatch({ type: 'runFailed', error }),
    );
  }

  function cancelRun() {
    job.current?.cancel();
    job.current = null;
    dispatch({ type: 'runFailed', error: { kind: 'cancelled', message: 'Cancelled' } });
  }

  function trySample() {
    const sample = exploreReducer(state, { type: 'sampleChosen' });
    dispatch({ type: 'sampleChosen' });
    startRun(sample);
  }

  const planDispatch = (action: ExploreAction) => {
    if (action.type === 'runRequested') startRun();
    else if (action.type === 'sampleChosen') trySample();
    else dispatch(action);
  };

  useDroppedPinNames(state, dispatch, geocoder);

  // Contraction hierarchies' preparing plays on its own clock, before the search.
  const part: RunPart = watching ? run.part : 'search';
  const preparePlayback = watching && part === 'prepare' ? run.preparePlayback : null;
  const playing = preparePlayback ? preparePlayback.playing : watching && run.playback.playing;
  useAnimationClock(playing, (elapsed) =>
    dispatch({
      type: preparePlayback ? 'preparePlayback' : 'playback',
      apply: (playback, total) => tick(playback, elapsed, total),
    }),
  );

  const step = watching ? Math.floor(run.playback.position) : 0;
  const prepareStep = preparePlayback ? Math.floor(preparePlayback.position) : 0;
  // The single-search view; comparisons draw their own maps.
  const single: RunView | null =
    watching && !comparing
      ? {
          ...run.result.runs[0]!,
          objective: run.result.objective,
          traffic: run.result.traffic,
          preparation: run.result.preparation,
          target: run.result.snapped.target.node,
        }
      : null;
  const hierarchy = single?.algorithm === 'ch' ? single.preparation?.hierarchy : undefined;
  const landmarks = single?.algorithm === 'alt' ? single.preparation?.landmarks : undefined;
  const prepares = Boolean(hierarchy || landmarks);
  const checkKey = () => dispatch({ type: 'trafficDialogOpened' });
  const toggleLayer = () => dispatch({ type: 'trafficLayerToggled' });
  const result = watching ? run.result : null;
  const look = useMemo(() => {
    const only = result?.runs[0];
    if (!result || !only || !state.start || !state.target) return null;
    const { start, target } = result.snapped;
    const snaps: SnapLink[] = [
      { from: [state.start.lon, state.start.lat], to: [start.lon, start.lat] },
      { from: [state.target.lon, state.target.lat], to: [target.lon, target.lat] },
    ];
    const { timeline } = only;
    return {
      timeline,
      colors: explorationColors(only.algorithm),
      snaps,
      meetLabel: (m: number) => `Met · best ${formatCost(timeline.meetCost[m]!, result.objective)}`,
    };
  }, [result, state.start, state.target]);
  const advanced = useMemo(
    () =>
      result && result.runs.length === 1
        ? advancedView(
            result.runs[0]!,
            result.preparation,
            result.snapped.target.node,
            part === 'prepare',
          )
        : undefined,
    [result, part],
  );
  const [highlight, setHighlight] = useState<[number, number] | null>(null);
  const live = result?.traffic.status === 'live' ? result.traffic : null;
  const mapTraffic = useMemo(
    () => (live ? { live, bands: state.trafficLayer } : null),
    [live, state.trafficLayer],
  );
  const exploration =
    single && look
      ? {
          step,
          ...look,
          highlight,
          traffic: mapTraffic,
          advanced,
          contraction:
            hierarchy && part === 'prepare'
              ? { replay: hierarchy.replay, step: prepareStep }
              : null,
        }
      : null;
  const onPart = (next: RunPart) => dispatch({ type: 'partChosen', part: next });
  const tabs = prepares && watching && (
    <PartTabs
      part={part}
      onPart={onPart}
      reused={Boolean((hierarchy ?? landmarks)?.reused)}
      done={!hierarchy || (run.preparePlayback?.position ?? 0) >= hierarchy.replay.steps}
    />
  );
  const skipToSearch = () => {
    dispatch({ type: 'partChosen', part: 'search' });
    dispatch({ type: 'playback', apply: play });
  };

  const map = (
    <MapCanvas
      start={state.start}
      target={state.target}
      area={watching ? null : (savedArea?.box ?? previewArea(state.start, state.target))}
      exploration={exploration}
      padding={mapPadding(phone, watching, planSheetHeight)}
      draggable={!watching && run.status !== 'loading'}
      onMapClick={(point) => {
        if (!watching && run.status !== 'loading') dispatch({ type: 'mapClicked', point });
      }}
      onPinMoved={(role, point) => dispatch({ type: 'pinMoved', role, point })}
    />
  );

  const edit = () => dispatch({ type: 'editRequested' });
  const showSaved = () => {
    edit();
    setTimeout(() => document.getElementById('saved-routes')?.focus());
  };

  return (
    <div className={styles.page} data-view={watching ? 'run' : 'plan'}>
      <SkipLink target={watching ? 'playback' : 'plan'}>
        {watching
          ? 'Skip to the playback controls'
          : phone
            ? 'Skip to the run settings'
            : 'Skip to the route and algorithms'}
      </SkipLink>
      <TopBar route="explore" immersive={watching}>
        {watching && !phone && (
          <RouteSummary state={state} traffic={run.result.traffic} onEdit={edit}>
            {comparing && <LinkToggle state={state} dispatch={dispatch} />}
          </RouteSummary>
        )}
      </TopBar>

      {comparing ? (
        <div className={styles.body}>
          <CompareView
            state={state}
            run={run}
            phone={phone}
            sync={sync}
            step={step}
            dispatch={dispatch}
            onEdit={edit}
          />
        </div>
      ) : (
        <div className={styles.body}>
          {!watching && (
            <aside
              ref={planSheet}
              id="plan"
              tabIndex={-1}
              className={styles.side}
              aria-label="Plan a run"
            >
              {run.status === 'loading' && (
                <LoadingPanel
                  stage={run.stage}
                  server={run.server}
                  running={runningLabel(state.algorithms)}
                  traffic={trafficSource && { provider: trafficSource.provider, ...run.traffic }}
                  needs={preparationsOf(state.algorithms)}
                  prepare={run.prepare}
                  onCancel={cancelRun}
                />
              )}
              {run.status === 'failed' && (
                <ErrorPanel
                  error={run.error}
                  onRetry={() => startRun()}
                  onBack={edit}
                  saved={saved.areas.length}
                  onShowSaved={showSaved}
                />
              )}
              <PlanPanel
                state={state}
                dispatch={planDispatch}
                geocoder={geocoder}
                offline={offline}
              />
            </aside>
          )}

          <main className={styles.mapArea} aria-label="Map">
            <h1 className="visually-hidden">Explore</h1>
            {map}
            {!watching && online && (
              <p className={styles.hint}>
                Click the map to place {state.nextPick === 'start' ? 'A' : 'B'}. Drag A or B to
                fine-tune.
              </p>
            )}
            {!watching && !online && (
              <p className={`${styles.hint} ${styles.offlineHint}`}>
                <CloudOffIcon size={18} />
                <span>
                  Offline, the map shows only places you have run before.
                  {savedArea &&
                    " The dashed box is this route's saved area: A and B can move anywhere inside it."}
                </span>
              </p>
            )}
            {!watching && phone && (
              <OfflineChip
                online={online}
                detail="saved routes only"
                className={styles.phoneOffline}
              />
            )}
            {watching && single && !phone && (
              <>
                <div className={styles.runCard}>
                  <RunCard
                    run={single}
                    step={step}
                    status={part === 'prepare' ? (hierarchy ? 'Preparing' : 'Prepared') : undefined}
                  >
                    {tabs}
                  </RunCard>
                  {algorithms[single.algorithm].advanced ? (
                    <AdvancedMapKey run={single} part={part} />
                  ) : (
                    single.timeline.bidirectional && <MapKey run={single} />
                  )}
                  {single.traffic?.status === 'live' && (
                    <div className={styles.trafficKey}>
                      <TrafficKey
                        on={state.trafficLayer}
                        onToggle={toggleLayer}
                        clearRoute={Boolean(single.traffic.story?.changed)}
                      />
                    </div>
                  )}
                  {single.traffic && (
                    <TrafficNotice outcome={single.traffic} onCheckKey={checkKey} />
                  )}
                  <SlowDrawingNotice />
                </div>
                <section
                  id="playback"
                  tabIndex={-1}
                  className={styles.playback}
                  aria-label="Playback"
                >
                  <RunPlayback
                    run={single}
                    part={part}
                    playback={run.playback}
                    preparePlayback={run.preparePlayback}
                    hierarchy={hierarchy}
                    dispatch={dispatch}
                    onSkip={skipToSearch}
                  />
                </section>
              </>
            )}
            {watching && single && phone && (
              <PhoneRun
                run={single}
                part={part}
                tabs={tabs}
                preparePlayback={run.preparePlayback}
                hierarchy={hierarchy}
                onSkip={skipToSearch}
                trafficLayer={state.trafficLayer}
                onToggleTraffic={toggleLayer}
                onCheckKey={checkKey}
                names={run.result.places}
                onHighlight={setHighlight}
                playback={run.playback}
                step={step}
                dispatch={dispatch}
                onEdit={edit}
              />
            )}
          </main>

          {watching && single && !phone && (
            <aside className={styles.inspectorSide} aria-label="Inspector">
              {part === 'prepare' && hierarchy ? (
                <ContractionInspector
                  hierarchy={hierarchy}
                  step={prepareStep}
                  names={run.result.places}
                  objective={run.result.objective}
                />
              ) : part === 'prepare' && landmarks ? (
                <LandmarksPrepared
                  landmarks={landmarks}
                  names={run.result.places}
                  objective={run.result.objective}
                />
              ) : (
                <Inspector
                  run={single}
                  step={step}
                  names={run.result.places}
                  playing={run.playback.playing}
                  onHighlight={setHighlight}
                  onWatch={() =>
                    dispatch({
                      type: 'playback',
                      apply: (p, total) => play({ ...p, position: 0 }, total),
                    })
                  }
                />
              )}
            </aside>
          )}
        </div>
      )}

      {state.trafficDialog && (
        <TrafficDialog
          settings={state.traffic}
          check={traffic.check}
          onSave={(settings) => dispatch({ type: 'trafficSaved', settings })}
          onClose={() => dispatch({ type: 'trafficDialogClosed' })}
        />
      )}
    </div>
  );
}

/** How the header names the speeds a run used. */
function speedSource(traffic: TrafficOutcome | undefined) {
  if (traffic?.status === 'live') {
    return `Live traffic, ${PROVIDER_NAME[traffic.provider]}, ${fetchedTime(traffic.fetchedAt)}`;
  }
  return traffic?.status === 'failed' ? 'Speed limits (no live traffic)' : 'Speed limits';
}

/** Looks up addresses for pins dropped on the map, so they get a readable name. */
function useDroppedPinNames(
  state: ExploreState,
  dispatch: (action: ExploreAction) => void,
  geocoder: ReturnType<typeof useServices>['geocoder'],
) {
  for (const role of ['start', 'target'] as Role[]) {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- fixed two-iteration loop
    usePinName(role, state[role], dispatch, geocoder);
  }
}

function usePinName(
  role: Role,
  place: Place | null,
  dispatch: (action: ExploreAction) => void,
  geocoder: ReturnType<typeof useServices>['geocoder'],
) {
  useEffect(() => {
    if (!place || place.detail !== 'Dropped pin') return;
    const controller = new AbortController();
    geocoder
      .reverse({ lat: place.lat, lon: place.lon }, { signal: controller.signal })
      .then((found) => {
        if (found) {
          dispatch({
            type: 'placeNamed',
            role,
            place: { ...place, name: found.name, detail: found.detail },
          });
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [role, place, dispatch, geocoder]);
}

function RouteSummary({
  state,
  traffic,
  onEdit,
  children,
}: {
  state: ExploreState;
  traffic?: TrafficOutcome;
  onEdit(): void;
  children?: ReactNode;
}) {
  return (
    <>
      <div className={styles.summary}>
        <PointBadge role="start" size={18} />
        <span>{state.start?.name}</span>
        <span aria-hidden="true" className={styles.summaryMuted}>
          →
        </span>
        <PointBadge role="target" size={18} />
        <span>{state.target?.name}</span>
        <span className={styles.summaryMuted}>
          · {MODE_LABEL[state.mode]} · {OBJECTIVE_LABEL[state.objective]} · {speedSource(traffic)}
        </span>
      </div>
      <div className={styles.actions}>
        {children}
        <button type="button" className={styles.editButton} onClick={onEdit}>
          <EditIcon size={15} />
          Edit setup
        </button>
      </div>
    </>
  );
}

interface PhoneRunProps {
  run: RunView;
  part: RunPart;
  /** Prepare and Search, for algorithms that prepare first. */
  tabs: ReactNode;
  preparePlayback: PlaybackState | null;
  hierarchy?: HierarchyView;
  onSkip(): void;
  trafficLayer: boolean;
  onToggleTraffic(): void;
  onCheckKey(): void;
  names: NodeLabels;
  onHighlight(position: [number, number] | null): void;
  playback: PlaybackState;
  step: number;
  dispatch(action: ExploreAction): void;
  onEdit(): void;
}

function PhoneRun({
  run,
  part,
  tabs,
  preparePlayback,
  hierarchy,
  onSkip,
  trafficLayer,
  onToggleTraffic,
  onCheckKey,
  names,
  onHighlight,
  playback,
  step,
  dispatch,
  onEdit,
}: PhoneRunProps) {
  const [details, setDetails] = useState(false);
  const prepareAt = preparePlayback ? Math.floor(preparePlayback.position) : 0;
  const live = run.traffic?.status === 'live' ? run.traffic : null;
  // At the end, the sheet sums up how traffic changed the route.
  const summary =
    live && step >= run.timeline.steps && run.timeline.route
      ? trafficSummary(live, run.objective)
      : null;
  return (
    <>
      <div className={styles.phoneTop}>
        <RunCard
          run={run}
          step={step}
          compact
          status={part === 'prepare' ? (hierarchy ? 'Preparing' : 'Prepared') : undefined}
          prepareStep={
            part === 'prepare' && preparePlayback ? Math.floor(preparePlayback.position) : undefined
          }
        >
          {tabs}
        </RunCard>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Edit setup"
          onClick={onEdit}
        >
          <EditIcon size={17} />
        </button>
      </div>
      {live && (
        <div className={styles.phoneTraffic}>
          <TrafficKey on={trafficLayer} onToggle={onToggleTraffic} clearRoute={false} />
        </div>
      )}
      <section id="playback" tabIndex={-1} className={styles.sheet} aria-label="Playback">
        <span className={styles.grabber} aria-hidden="true" />
        {run.traffic && !details && <TrafficNotice outcome={run.traffic} onCheckKey={onCheckKey} />}
        {!details && <SlowDrawingNotice />}
        <button
          type="button"
          className={styles.narration}
          aria-expanded={details}
          onClick={() => setDetails((open) => !open)}
        >
          {summary ? (
            <span className={styles.trafficSummary}>
              <b>
                <span className={styles.trafficDot} aria-hidden="true" />
                Traffic changed the route
              </b>
              {summary}
            </span>
          ) : (
            <span>
              {advancedLine(run, part === 'prepare' ? prepareAt : step, names, part) ??
                describeStep(run.timeline, step, run.algorithm, run.objective, run.weight)}
              {!details && part === 'search' && run.algorithm !== 'ch' && (
                <StopMeterLine run={run} step={step} />
              )}
            </span>
          )}
          <span className={styles.details}>
            Details
            {details ? <ChevronDownIcon size={16} /> : <ChevronUpIcon size={16} />}
          </span>
        </button>
        {details &&
          (part === 'prepare' && hierarchy ? (
            <ContractionInspector
              hierarchy={hierarchy}
              step={prepareAt}
              names={names}
              objective={run.objective}
              compact
            />
          ) : part === 'prepare' && run.preparation?.landmarks ? (
            <LandmarksPrepared
              landmarks={run.preparation.landmarks}
              names={names}
              objective={run.objective}
            />
          ) : (
            <Inspector
              run={run}
              step={step}
              names={names}
              playing={playback.playing}
              compact
              onHighlight={onHighlight}
            />
          ))}
        <RunPlayback
          run={run}
          part={part}
          playback={playback}
          preparePlayback={preparePlayback}
          hierarchy={hierarchy}
          dispatch={dispatch}
          onSkip={onSkip}
          compact
        />
        {roundsOf(run) && part === 'search' && (
          <p className={styles.phoneNote}>The step buttons jump a whole round at a time.</p>
        )}
        {part === 'prepare' && hierarchy && !hierarchy.reused && (
          <p className={styles.phoneNote}>
            Your phone did all of this in {formatMs(hierarchy.ms)}; it's slowed down to watch.
          </p>
        )}
      </section>
    </>
  );
}

/** Where a bidirectional search's sides first met, if they did. */
const firstMeeting = (timeline: Timeline) =>
  timeline.meetCount > 0 ? timeline.meetStep[0] : undefined;

interface RunPlaybackProps {
  run: RunView;
  part: RunPart;
  playback: PlaybackState;
  preparePlayback: PlaybackState | null;
  hierarchy?: HierarchyView;
  dispatch(action: ExploreAction): void;
  onSkip(): void;
  compact?: boolean;
}

/**
 * The playback bar for whatever is being watched: contraction being prepared, Bellman-Ford a
 * round at a time, or any other search a step at a time.
 */
function RunPlayback({
  run,
  part,
  playback,
  preparePlayback,
  hierarchy,
  dispatch,
  onSkip,
  compact = false,
}: RunPlaybackProps) {
  const variant = compact ? 'compact' : 'full';
  if (part === 'prepare') {
    if (!hierarchy || !preparePlayback) return null;
    const { replay } = hierarchy;
    const at = Math.floor(preparePlayback.position);
    return (
      <PlaybackBar
        playback={preparePlayback}
        total={replay.steps}
        onChange={(apply) => dispatch({ type: 'preparePlayback', apply })}
        variant={variant}
        label={
          compact
            ? `Contracted ${formatCount(at)} of ${formatCount(replay.steps)} nodes`
            : `Contracted ${formatCount(at)} of ${formatCount(replay.steps)} nodes · ${formatCount(replay.shortcutsBy[at]!)} shortcuts so far`
        }
        onSkip={onSkip}
      />
    );
  }
  const rounds = roundsOf(run);
  const total = run.timeline.steps;
  const step = Math.floor(playback.position);
  const jump = (direction: 1 | -1) => () => {
    const to = roundJump(rounds!, step, direction, total);
    dispatch({ type: 'playback', apply: (p, t) => pause(seek(p, to, t)) });
  };
  return (
    <PlaybackBar
      playback={playback}
      total={total}
      onChange={(apply) => dispatch({ type: 'playback', apply })}
      variant={variant}
      meetAt={firstMeeting(run.timeline)}
      rounds={
        rounds
          ? {
              label: run.timeline.stopped
                ? `round ${rounds.roundAt[step]}`
                : `round ${rounds.roundAt[step]} of ${rounds.count - 1}`,
              onBack: jump(-1),
              onForward: jump(1),
            }
          : undefined
      }
    />
  );
}
