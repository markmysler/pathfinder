import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { KeyCheck, TrafficSettings } from '../traffic/settings';
import { TrafficDialog } from './TrafficDialog';

function renderDialog(
  settings: TrafficSettings = { provider: null, keys: {} },
  check: (source: unknown) => Promise<KeyCheck> = async () => ({ ok: true }),
) {
  const onSave = vi.fn();
  const onClose = vi.fn();
  const checkKey = vi.fn(check);
  render(<TrafficDialog settings={settings} onSave={onSave} onClose={onClose} check={checkKey} />);
  return { onSave, onClose, checkKey };
}

const keyBox = (name: RegExp | string = /API key/) => screen.getByLabelText(name);

describe('TrafficDialog', () => {
  it('is a labelled dialog that starts on TomTom, with the key hidden', () => {
    renderDialog();
    expect(screen.getByRole('dialog', { name: 'Live traffic' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'TomTom' })).toHaveAttribute('aria-pressed', 'true');
    expect(keyBox('Your TomTom API key')).toHaveAttribute('type', 'password');
    expect(keyBox()).toHaveFocus();
    expect(screen.getByText(/Your key stays in this browser\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /free one from TomTom/ })).toHaveAttribute(
      'href',
      'https://developer.tomtom.com/',
    );
  });

  it('shows the key on request', async () => {
    renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Show key' }));
    expect(keyBox()).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide key' })).toBeInTheDocument();
  });

  it('saves a trimmed key for the chosen provider and turns traffic on', async () => {
    const { onSave } = renderDialog({ provider: null, keys: { tomtom: 'old' } });
    await userEvent.click(screen.getByRole('button', { name: 'HERE' }));
    expect(keyBox('Your HERE API key')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Save and turn on' })).toBeDisabled();
    await userEvent.type(keyBox(), '  h-key ');
    await userEvent.click(screen.getByRole('button', { name: 'Save and turn on' }));
    expect(onSave).toHaveBeenCalledWith({
      provider: 'here',
      keys: { tomtom: 'old', here: 'h-key' },
    });
  });

  it('opens on the provider in use, with its key', () => {
    renderDialog({ provider: 'here', keys: { here: 'h-key' } });
    expect(screen.getByRole('button', { name: 'HERE' })).toHaveAttribute('aria-pressed', 'true');
    expect(keyBox()).toHaveValue('h-key');
  });

  it('tests a key and says it works', async () => {
    const { checkKey } = renderDialog();
    await userEvent.type(keyBox(), 't-key');
    await userEvent.click(screen.getByRole('button', { name: 'Test key' }));
    expect(checkKey).toHaveBeenCalledWith({ provider: 'tomtom', key: 't-key' });
    expect(await screen.findByText('Works: TomTom sent traffic for a test area.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'TomTom · key works' })).toBeInTheDocument();
  });

  it('says why a key failed', async () => {
    renderDialog(undefined, async () => ({ ok: false, reason: 'unavailable' }));
    await userEvent.click(screen.getByRole('button', { name: 'HERE' }));
    await userEvent.type(keyBox(), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Test key' }));
    expect(
      await screen.findByText(/HERE didn’t answer\. That usually means a wrong key/),
    ).toBeVisible();
  });

  it('forgets a test result when the key changes', async () => {
    renderDialog();
    await userEvent.type(keyBox(), 't');
    await userEvent.click(screen.getByRole('button', { name: 'Test key' }));
    await screen.findByText(/Works/);
    await userEvent.type(keyBox(), 'x');
    expect(screen.queryByText(/Works/)).not.toBeInTheDocument();
  });

  it('removes the key, turning traffic off if it was in use', async () => {
    const { onSave } = renderDialog({ provider: 'tomtom', keys: { tomtom: 't', here: 'h' } });
    await userEvent.click(screen.getByRole('button', { name: 'Remove key' }));
    expect(onSave).toHaveBeenCalledWith({ provider: null, keys: { here: 'h' } });
  });

  it('closes without saving from Cancel, the close button or Escape', async () => {
    const { onClose, onSave } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onSave).not.toHaveBeenCalled();
  });
});
