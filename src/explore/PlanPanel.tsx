import type { Dispatch, ReactNode } from 'react';
import { algorithms } from '../algorithms';
import type { Geocoder, Place } from '../geo/nominatim';
import { MAX_ROUTE_METERS, RouteTooLongError, searchArea } from '../osm/area';
import type { Objective } from '../osm/network';
import type { TravelMode } from '../osm/roads';
import { BikeIcon, CarIcon, PlayIcon, SwapIcon, WalkIcon } from '../ui/icons';
import { Segmented } from '../ui/Segmented';
import { AlgorithmPicker } from './AlgorithmPicker';
import type { ExploreAction, ExploreState } from './exploreState';
import { PlaceInput } from './PlaceInput';
import { TrafficRow } from './TrafficRow';
import styles from './PlanPanel.module.css';

const MODES = [
  { value: 'car', label: 'Car', icon: <CarIcon /> },
  { value: 'bike', label: 'Bike', icon: <BikeIcon /> },
  { value: 'walk', label: 'Walk', icon: <WalkIcon /> },
] as const satisfies readonly { value: TravelMode; label: string; icon: ReactNode }[];

const OBJECTIVES = [
  { value: 'fastest', label: 'Fastest' },
  { value: 'shortest', label: 'Shortest' },
] as const satisfies readonly { value: Objective; label: string }[];

const SPEED_SOURCE: Record<TravelMode, string> = {
  car: 'its speed limit',
  bike: 'a cycling pace of about 15 km/h',
  walk: 'a walking pace of about 5 km/h',
};

/** Why A and B can't be searched between yet, if they can't. */
function routeProblem(start: Place | null, target: Place | null): string | null {
  if (!start || !target) return null;
  try {
    searchArea(start, target);
    return null;
  } catch (error) {
    if (!(error instanceof RouteTooLongError)) throw error;
    return `A and B are ${(error.meters / 1000).toFixed(1)} km apart. Pathfinder handles trips up to ${MAX_ROUTE_METERS / 1000} km, so move them closer.`;
  }
}

function runLabel(chosen: ExploreState['algorithms']) {
  if (chosen.length === 0) return 'Run';
  if (chosen.length === 1) return `Run ${algorithms[chosen[0]!].name}`;
  return `Run ${chosen.length} algorithms`;
}

interface Props {
  state: ExploreState;
  dispatch: Dispatch<ExploreAction>;
  geocoder: Geocoder;
}

export function PlanPanel({ state, dispatch, geocoder }: Props) {
  const problem = routeProblem(state.start, state.target);
  const missing = !state.start ? 'A' : !state.target ? 'B' : null;
  const unchosen = state.algorithms.length === 0;

  return (
    <div className={styles.plan}>
      <section aria-label="Route" className={styles.route} data-part="route">
        <div className={styles.places}>
          <PlaceInput
            role="start"
            place={state.start}
            geocoder={geocoder}
            near={state.target ?? undefined}
            onChoose={(place) => dispatch({ type: 'placeChosen', role: 'start', place })}
          />
          <PlaceInput
            role="target"
            place={state.target}
            geocoder={geocoder}
            near={state.start ?? undefined}
            onChoose={(place) => dispatch({ type: 'placeChosen', role: 'target', place })}
          />
        </div>
        <button
          type="button"
          className={styles.iconButton}
          aria-label="Swap start and destination"
          onClick={() => dispatch({ type: 'swapped' })}
        >
          <SwapIcon size={20} />
        </button>
      </section>

      <section aria-label="Run settings" className={styles.settings} data-part="settings">
        <div className={styles.travel}>
          <h2 className={styles.sectionTitle}>How you travel</h2>
          <Segmented
            legend="Travel mode"
            options={MODES}
            value={state.mode}
            onChange={(mode) => dispatch({ type: 'modeChosen', mode })}
          />
          <Segmented
            legend="Optimise for"
            options={OBJECTIVES}
            value={state.objective}
            onChange={(objective) => dispatch({ type: 'objectiveChosen', objective })}
          />
          <p className={`${styles.caption} ${styles.explain}`}>
            Fastest weighs each road by travel time at {SPEED_SOURCE[state.mode]}
            {state.mode === 'car' && state.traffic.provider ? ', slowed by live traffic' : ''}.
            Shortest weighs it by length.
          </p>
        </div>

        <TrafficRow
          settings={state.traffic}
          mode={state.mode}
          problem={state.trafficProblem}
          onOpen={() => dispatch({ type: 'trafficDialogOpened' })}
          onSwitch={(on) => dispatch({ type: 'trafficSwitched', on })}
        />

        <AlgorithmPicker
          value={state.algorithms}
          onToggle={(algorithm) => dispatch({ type: 'algorithmToggled', algorithm })}
          weight={state.astarWeight}
          onWeight={(weight) => dispatch({ type: 'astarWeightChosen', weight })}
        />

        <div className={styles.runBar}>
          {problem && (
            <p className={styles.alert} role="alert">
              {problem}
            </p>
          )}
          {missing && (
            <p className={styles.caption}>Search for {missing} or click the map to drop it.</p>
          )}
          {!missing && unchosen && <p className={styles.caption}>Choose at least one algorithm.</p>}
          <button
            type="button"
            className={styles.run}
            disabled={missing !== null || problem !== null || unchosen}
            onClick={() => dispatch({ type: 'runRequested' })}
          >
            <PlayIcon />
            {runLabel(state.algorithms)}
          </button>
        </div>
      </section>
    </div>
  );
}
