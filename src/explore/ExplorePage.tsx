import { useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { algorithms } from '../algorithms';
import { PHONE, useAnimationClock, useElementHeight, useMediaQuery } from '../app/hooks';
import { useServices } from '../app/services';
import { TopBar } from '../app/TopBar';
import type { Place } from '../geo/nominatim';
import { createCameraSync } from '../map/cameraSync';
import { hexToRgb, type SnapLink } from '../map/explorationLayers';
import { MapCanvas, type Padding } from '../map/MapCanvas';
import { searchArea, type BBox } from '../osm/area';
import { tick, type PlaybackState } from '../playback/playback';
import { ALGORITHM_STYLE } from '../ui/algorithmStyle';
import { ChevronDownIcon, ChevronUpIcon, EditIcon, PointBadge } from '../ui/icons';
import type { RunningJob } from '../worker/client';
import { CompareView, LinkToggle } from './CompareView';
import styles from './ExplorePage.module.css';
import {
  exploreReducer,
  initialExplore,
  type ExploreAction,
  type ExploreState,
  type Role,
} from './exploreState';
import { Inspector, RunCard, type RunView } from './Inspector';
import { describeStep } from './narration';
import { PlanPanel } from './PlanPanel';
import { PlaybackBar } from './PlaybackBar';
import { ErrorPanel, LoadingPanel } from './StatusPanels';

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

/** Map space hidden behind panels, kept clear when framing A, B or the download area. */
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
  const { geocoder, searchClient } = useServices();
  const [state, dispatch] = useReducer(exploreReducer, initialExplore);
  const phone = useMediaQuery(PHONE);
  const job = useRef<RunningJob | null>(null);
  const planSheet = useRef<HTMLElement>(null);
  const planSheetHeight = useElementHeight(planSheet);
  const run = state.run;
  const watching = run.status === 'ready';
  const comparing = watching && run.result.runs.length > 1;
  const [sync] = useState(createCameraSync);
  useEffect(() => sync.setLinked(state.mapsLinked), [sync, state.mapsLinked]);

  function startRun() {
    if (!state.start || !state.target) return;
    dispatch({ type: 'runRequested' });
    const running = searchClient.run(
      {
        start: state.start,
        target: state.target,
        mode: state.mode,
        objective: state.objective,
        algorithms: state.algorithms,
      },
      (stage, server) => {
        if (job.current === running) dispatch({ type: 'runProgressed', stage, server });
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

  const planDispatch = (action: ExploreAction) =>
    action.type === 'runRequested' ? startRun() : dispatch(action);

  useDroppedPinNames(state, dispatch, geocoder);

  useAnimationClock(watching && run.playback.playing, (elapsed) =>
    dispatch({ type: 'playback', apply: (playback, total) => tick(playback, elapsed, total) }),
  );

  const step = watching ? Math.floor(run.playback.position) : 0;
  // The single-search view; comparisons draw their own maps.
  const single: RunView | null =
    watching && !comparing ? { ...run.result.runs[0]!, objective: run.result.objective } : null;
  const result = watching ? run.result : null;
  const look = useMemo(() => {
    const only = result?.runs[0];
    if (!result || !only || !state.start || !state.target) return null;
    const { start, target } = result.snapped;
    const snaps: SnapLink[] = [
      { from: [state.start.lon, state.start.lat], to: [start.lon, start.lat] },
      { from: [state.target.lon, state.target.lat], to: [target.lon, target.lat] },
    ];
    return {
      timeline: only.timeline,
      color: hexToRgb(ALGORITHM_STYLE[only.algorithm].color),
      snaps,
    };
  }, [result, state.start, state.target]);
  const exploration = single && look ? { step, ...look } : null;

  const map = (
    <MapCanvas
      start={state.start}
      target={state.target}
      area={watching ? null : previewArea(state.start, state.target)}
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

  return (
    <div className={styles.page} data-view={watching ? 'run' : 'plan'}>
      <TopBar route="explore" immersive={watching}>
        {watching && !phone && (
          <RouteSummary state={state} onEdit={edit}>
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
            <aside ref={planSheet} className={styles.side} aria-label="Plan a run">
              {run.status === 'loading' && (
                <LoadingPanel
                  stage={run.stage}
                  server={run.server}
                  running={runningLabel(state.algorithms)}
                  onCancel={cancelRun}
                />
              )}
              {run.status === 'failed' && (
                <ErrorPanel error={run.error} onRetry={startRun} onBack={edit} />
              )}
              <PlanPanel state={state} dispatch={planDispatch} geocoder={geocoder} />
            </aside>
          )}

          <main className={styles.mapArea} aria-label="Map">
            {map}
            {!watching && (
              <p className={styles.hint}>
                Click the map to place {state.nextPick === 'start' ? 'A' : 'B'}. Drag A or B to
                fine-tune.
              </p>
            )}
            {watching && single && !phone && (
              <>
                <div className={styles.runCard}>
                  <RunCard run={single} step={step} />
                </div>
                <div className={styles.playback}>
                  <PlaybackBar
                    playback={run.playback}
                    total={single.timeline.steps}
                    onChange={(apply) => dispatch({ type: 'playback', apply })}
                  />
                </div>
              </>
            )}
            {watching && single && phone && (
              <PhoneRun
                run={single}
                playback={run.playback}
                step={step}
                dispatch={dispatch}
                onEdit={edit}
              />
            )}
          </main>

          {single && !phone && (
            <aside className={styles.inspectorSide} aria-label="Inspector">
              <Inspector run={single} step={step} />
            </aside>
          )}
        </div>
      )}
    </div>
  );
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
  onEdit,
  children,
}: {
  state: ExploreState;
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
          · {MODE_LABEL[state.mode]} · {OBJECTIVE_LABEL[state.objective]} · Speed limits
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
  playback: PlaybackState;
  step: number;
  dispatch(action: ExploreAction): void;
  onEdit(): void;
}

function PhoneRun({ run, playback, step, dispatch, onEdit }: PhoneRunProps) {
  const [details, setDetails] = useState(false);
  return (
    <>
      <div className={styles.phoneTop}>
        <RunCard run={run} step={step} compact />
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Edit setup"
          onClick={onEdit}
        >
          <EditIcon size={17} />
        </button>
      </div>
      <section className={styles.sheet} aria-label="Playback">
        <span className={styles.grabber} aria-hidden="true" />
        <button
          type="button"
          className={styles.narration}
          aria-expanded={details}
          onClick={() => setDetails((open) => !open)}
        >
          <span>{describeStep(run.timeline, step, run.algorithm, run.objective)}</span>
          <span className={styles.details}>
            Details
            {details ? <ChevronDownIcon size={16} /> : <ChevronUpIcon size={16} />}
          </span>
        </button>
        {details && <Inspector run={run} step={step} />}
        <PlaybackBar
          playback={playback}
          total={run.timeline.steps}
          onChange={(apply) => dispatch({ type: 'playback', apply })}
          variant="compact"
        />
      </section>
    </>
  );
}
