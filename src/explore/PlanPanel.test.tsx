import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cabildo, casaRosada, fakeGeocoder } from '../test/fakes';
import { initialExplore, type ExploreState } from './exploreState';
import { PlanPanel } from './PlanPanel';

const ready: ExploreState = {
  ...initialExplore,
  start: casaRosada,
  target: cabildo,
  algorithms: ['astar'],
};

function renderPanel(state: ExploreState = ready) {
  const dispatch = vi.fn();
  render(<PlanPanel state={state} dispatch={dispatch} geocoder={fakeGeocoder()} />);
  return dispatch;
}

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
});
