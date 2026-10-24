import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { cabildo, casaRosada, fakeGeocoder } from '../test/fakes';
import { PlaceInput } from './PlaceInput';

describe('PlaceInput', () => {
  it('shows the chosen place in a labelled field', () => {
    render(
      <PlaceInput role="start" place={casaRosada} geocoder={fakeGeocoder()} onChoose={() => {}} />,
    );
    expect(screen.getByRole('textbox', { name: 'Start' })).toHaveValue('Casa Rosada');
  });

  it('searches when the user presses Enter and lists the results', async () => {
    const geocoder = fakeGeocoder();
    render(<PlaceInput role="target" place={null} geocoder={geocoder} onChoose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Destination' }), 'cabildo{Enter}');
    expect(geocoder.search).toHaveBeenCalledWith('cabildo', expect.anything());
    expect(
      await screen.findByRole('button', { name: /Cabildo de Buenos Aires/ }),
    ).toHaveTextContent('Bolívar 65, Buenos Aires');
  });

  it('does not search while the user is still typing', async () => {
    const geocoder = fakeGeocoder();
    render(<PlaceInput role="start" place={null} geocoder={geocoder} onChoose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Start' }), 'casa');
    expect(geocoder.search).not.toHaveBeenCalled();
  });

  it('chooses a result and closes the list', async () => {
    const onChoose = vi.fn();
    render(<PlaceInput role="start" place={null} geocoder={fakeGeocoder()} onChoose={onChoose} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Start' }), 'casa{Enter}');
    await userEvent.click(await screen.findByRole('button', { name: /Casa Rosada/ }));
    expect(onChoose).toHaveBeenCalledWith(casaRosada);
    expect(screen.queryByRole('button', { name: /Casa Rosada/ })).not.toBeInTheDocument();
  });

  it('says so when nothing matches', async () => {
    render(
      <PlaceInput role="start" place={null} geocoder={fakeGeocoder([])} onChoose={() => {}} />,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Start' }), 'nowhere{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent('No places found');
  });

  it('explains when the search service fails', async () => {
    const geocoder = fakeGeocoder();
    geocoder.search.mockRejectedValueOnce(new Error('HTTP 503'));
    render(<PlaceInput role="start" place={null} geocoder={geocoder} onChoose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Start' }), 'casa{Enter}');
    expect(await screen.findByRole('status')).toHaveTextContent(/search isn't available/i);
  });

  it('closes the results on Escape', async () => {
    render(<PlaceInput role="start" place={null} geocoder={fakeGeocoder()} onChoose={() => {}} />);
    await userEvent.type(screen.getByRole('textbox', { name: 'Start' }), 'casa{Enter}');
    await screen.findByRole('button', { name: /Casa Rosada/ });
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('button', { name: /Casa Rosada/ })).not.toBeInTheDocument();
  });

  it('follows the place when it changes elsewhere, such as a map click', () => {
    const { rerender } = render(
      <PlaceInput role="start" place={casaRosada} geocoder={fakeGeocoder()} onChoose={() => {}} />,
    );
    rerender(
      <PlaceInput role="start" place={cabildo} geocoder={fakeGeocoder()} onChoose={() => {}} />,
    );
    expect(screen.getByRole('textbox', { name: 'Start' })).toHaveValue('Cabildo de Buenos Aires');
  });

  it('offline, says searching needs a connection instead of asking', async () => {
    const geocoder = fakeGeocoder();
    render(
      <PlaceInput
        role="start"
        place={null}
        geocoder={geocoder}
        online={false}
        onChoose={() => {}}
      />,
    );
    await userEvent.type(screen.getByRole('textbox', { name: 'Start' }), 'palermo{Enter}');
    expect(geocoder.search).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Searching needs a connectionPick a saved route below, or click the map inside a saved area to place A.',
    );
  });
});
