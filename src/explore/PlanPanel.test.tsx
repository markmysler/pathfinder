import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cabildo, casaRosada, fakeGeocoder } from '../test/fakes';
import { initialExplore, type ExploreState } from './exploreState';
import { PlanPanel, type Offline } from './PlanPanel';
import type { SavedArea } from '../osm/saved';

const ready: ExploreState = {
  ...initialExplore,
  start: casaRosada,
  target: cabildo,
  algorithms: ['astar'],
};

function renderPanel(state: ExploreState = ready, offline?: Partial<Offline>) {
  const dispatch = vi.fn();
  render(
    <PlanPanel
      state={state}
      dispatch={dispatch}
      geocoder={fakeGeocoder()}
      offline={offline && { areas: [], now: Date.now(), onForget: () => {}, ...offline }}
    />,
  );
  return dispatch;
}

const savedHere: SavedArea = {
  key: 'roads-v1:here',
  box: { south: -34.62, west: -58.38, north: -34.6, east: -58.36 },
  savedAt: Date.now(),
  bytes: 4_100_000,
  start: { name: casaRosada.name, lat: casaRosada.lat, lon: casaRosada.lon },
  target: { name: cabildo.name, lat: cabildo.lat, lon: cabildo.lon },
};

describe('PlanPanel', () => {
  it('names the algorithm on the run button', () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Run A* search' })).toBeEnabled();
  });

  it('counts the algorithms on the run button when comparing', () => {
    renderPanel({ ...ready, algorithms: ['greedy', 'dijkstra', 'astar'] });
    expect(screen.getByRole('button', { name: 'Run 3 algorithms' })).toBeEnabled();
  });

  it('asks for an algorithm when none is chosen', () => {
    renderPanel({ ...ready, algorithms: [] });
    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
    expect(screen.getByText('Choose at least one algorithm.')).toBeInTheDocument();
  });

  it('keeps the run button disabled until A and B are set', () => {
    renderPanel({ ...ready, target: null });
    expect(screen.getByRole('button', { name: 'Run A* search' })).toBeDisabled();
    expect(screen.getByText(/search for B or click the map/i)).toBeInTheDocument();
  });

  it('offers a sample route while A and B are both empty', async () => {
    const dispatch = renderPanel({ ...initialExplore });
    await userEvent.click(screen.getByRole('button', { name: 'Try a sample route' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'sampleChosen' });
  });

  it('stops offering the sample once a place is chosen', () => {
    renderPanel({ ...ready, target: null });
    expect(screen.queryByRole('button', { name: 'Try a sample route' })).not.toBeInTheDocument();
  });

  it('starts a run', async () => {
    const dispatch = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'runRequested' });
  });

  it('changes travel mode and objective', async () => {
    const dispatch = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Walk' }));
    await userEvent.click(screen.getByRole('button', { name: 'Shortest' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'modeChosen', mode: 'walk' });
    expect(dispatch).toHaveBeenCalledWith({ type: 'objectiveChosen', objective: 'shortest' });
    expect(screen.getByRole('button', { name: 'Car' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('swaps A and B', async () => {
    const dispatch = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Swap start and destination' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'swapped' });
  });

  it('adds an algorithm to compare', async () => {
    const dispatch = renderPanel();
    await userEvent.click(screen.getByRole('checkbox', { name: /Greedy/ }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'algorithmToggled', algorithm: 'greedy' });
  });

  it('warns about trips beyond the 15 km limit and will not run them', () => {
    renderPanel({ ...ready, target: { ...cabildo, lon: cabildo.lon + 0.3 } });
    expect(screen.getByRole('alert')).toHaveTextContent(/apart.*up to 15 km/);
    expect(screen.getByRole('button', { name: 'Run A* search' })).toBeDisabled();
  });

  it('offers live traffic, opening the key dialog', async () => {
    const dispatch = renderPanel();
    await userEvent.click(screen.getByRole('button', { name: 'Add key' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'trafficDialogOpened' });
  });

  it('switches saved traffic on and off, and says fastest routes use it', async () => {
    const dispatch = renderPanel({
      ...ready,
      traffic: { provider: 'tomtom', keys: { tomtom: 'k' } },
    });
    expect(screen.getByText(/slowed by live traffic/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Live traffic' }));
    expect(dispatch).toHaveBeenCalledWith({ type: 'trafficSwitched', on: false });
  });

  describe('offline', () => {
    it('lists the saved routes, and places A and B from one', async () => {
      const dispatch = renderPanel({ ...ready, start: null, target: null }, { areas: [savedHere] });
      expect(screen.getByText(/Searching for places needs a connection/)).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: /Casa Rosada → Cabildo/ }));
      expect(dispatch).toHaveBeenCalledWith({
        type: 'routeChosen',
        start: { ...savedHere.start, detail: '' },
        target: { ...savedHere.target, detail: '' },
      });
    });

    it('removes a saved route', async () => {
      const onForget = vi.fn();
      renderPanel(ready, { areas: [savedHere], onForget });
      await userEvent.click(screen.getByRole('button', { name: /^Remove the saved streets/ }));
      expect(onForget).toHaveBeenCalledWith(savedHere);
    });

    it("says when the route's streets are on this device", () => {
      renderPanel(ready, { areas: [savedHere] });
      expect(screen.getByText('Streets for this route are on this device.')).toBeInTheDocument();
    });

    it('says live traffic needs a connection, and the key stays', () => {
      renderPanel(
        {
          ...ready,
          mode: 'car',
          traffic: { provider: 'tomtom', keys: { tomtom: 'k' } },
        },
        {},
      );
      expect(screen.queryByRole('switch', { name: 'Live traffic' })).toBeNull();
      expect(screen.getByText(/Live traffic needs a connection\./).parentElement).toHaveTextContent(
        'Until then routes use speed limits; your TomTom key stays saved.',
      );
    });

    it('shows none of this online', () => {
      renderPanel(ready);
      expect(screen.queryByText(/Searching for places needs a connection/)).toBeNull();
      expect(screen.queryByRole('region', { name: /Saved on this/ })).toBeNull();
    });
  });
});
