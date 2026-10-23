import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TravelMode } from '../osm/roads';
import type { TrafficSettings } from '../traffic/settings';
import type { TrafficFailure } from '../traffic/types';
import { TrafficRow } from './TrafficRow';

function renderRow(
  settings: TrafficSettings,
  { mode = 'car', problem = null }: { mode?: TravelMode; problem?: TrafficFailure | null } = {},
) {
  const onOpen = vi.fn();
  const onSwitch = vi.fn();
  render(
    <TrafficRow
      settings={settings}
      mode={mode}
      problem={problem}
      onOpen={onOpen}
      onSwitch={onSwitch}
    />,
  );
  return { onOpen, onSwitch };
}

const tomtomOn: TrafficSettings = { provider: 'tomtom', keys: { tomtom: 'k' } };

describe('TrafficRow', () => {
  it('invites a key when there is none', async () => {
    const { onOpen } = renderRow({ provider: null, keys: {} });
    expect(screen.getByText(/Live traffic off\./)).toBeInTheDocument();
    expect(screen.getByText(/stays in this browser/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add key' }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('shows traffic on, with a switch to turn it off and a way to change the key', async () => {
    const { onOpen, onSwitch } = renderRow(tomtomOn);
    expect(screen.getByText('Live traffic on')).toBeInTheDocument();
    expect(screen.getByText('TomTom · your key')).toBeInTheDocument();
    const toggle = screen.getByRole('switch', { name: 'Live traffic' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(toggle);
    expect(onSwitch).toHaveBeenCalledWith(false);
    await userEvent.click(screen.getByRole('button', { name: 'Change' }));
    expect(onOpen).toHaveBeenCalled();
  });

  it('shows a saved key switched off', async () => {
    const { onSwitch } = renderRow({ provider: null, keys: { here: 'k' } });
    expect(screen.getByText('Live traffic off')).toBeInTheDocument();
    expect(screen.getByText('Uses speed limits · HERE key saved')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: 'Live traffic' }));
    expect(onSwitch).toHaveBeenCalledWith(true);
  });

  it('explains that traffic is for driving when cycling or walking', () => {
    renderRow(tomtomOn, { mode: 'bike' });
    expect(screen.getByText(/Live traffic is for driving\./)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('warns when the key was refused on the last run', async () => {
    const { onOpen } = renderRow(tomtomOn, { problem: 'key' });
    expect(screen.getByText('TomTom refused your key.')).toBeInTheDocument();
    expect(screen.getByText(/use speed limits until it works/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Check key' }));
    expect(onOpen).toHaveBeenCalled();
  });
});
