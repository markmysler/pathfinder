import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdatePrompt } from './UpdatePrompt';

describe('UpdatePrompt', () => {
  it('offers to reload once a new version is ready', async () => {
    const reload = vi.fn();
    render(<UpdatePrompt ready holding={false} onReload={reload} />);
    expect(screen.getByRole('status')).toHaveTextContent('Pathfinder has been updated.');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(reload).toHaveBeenCalled();
  });

  it('waits while a run is open, so reloading never throws a search away', () => {
    const { rerender } = render(<UpdatePrompt ready holding onReload={vi.fn()} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    rerender(<UpdatePrompt ready holding={false} onReload={vi.fn()} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('can be put off until the next visit', async () => {
    render(<UpdatePrompt ready holding={false} onReload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says nothing while there is nothing new', () => {
    const { container } = render(<UpdatePrompt ready={false} holding={false} onReload={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
