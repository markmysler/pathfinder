import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fireEvent } from '@testing-library/react';
import type { PlaybackState } from '../playback/playback';
import { PlaybackBar } from './PlaybackBar';

const total = 9_874;
const midway: PlaybackState = { position: 4_812.4, playing: true, speed: 10 };

function renderBar(playback = midway, variant: 'full' | 'compact' = 'full') {
  const onChange = vi.fn<(apply: (p: PlaybackState, total: number) => PlaybackState) => void>();
  render(<PlaybackBar playback={playback} total={total} onChange={onChange} variant={variant} />);
  /** The playback state after the last change the bar asked for. */
  const applied = () => onChange.mock.lastCall![0](playback, total);
  return { onChange, applied };
}

describe('PlaybackBar', () => {
  it('shows where playback is', () => {
    renderBar();
    expect(screen.getByText(/Step/).closest('label')).toHaveTextContent('Step 4,812 of 9,874');
    expect(screen.getByRole('slider', { name: 'Step' })).toHaveValue('4812');
  });

  it('pauses while playing and plays while paused', async () => {
    const playing = renderBar();
    await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(playing.applied().playing).toBe(false);
  });

  it('plays when paused', async () => {
    const { applied } = renderBar({ ...midway, playing: false });
    await userEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(applied().playing).toBe(true);
  });

  it.each([
    ['Restart', { position: 0, playing: true }],
    ['Step back', { position: 4_812, playing: false }],
    ['Step forward', { position: 4_813, playing: false }],
    ['Jump to end', { position: total, playing: false }],
  ])('%s', async (name, expected) => {
    const { applied } = renderBar();
    await userEvent.click(screen.getByRole('button', { name }));
    expect(applied()).toMatchObject(expected);
  });

  it('scrubs to a step', () => {
    const { applied } = renderBar();
    fireEvent.change(screen.getByRole('slider', { name: 'Step' }), { target: { value: '100' } });
    expect(applied().position).toBe(100);
  });

  it('changes speed on a 0.1× to 100× slider', () => {
    const { applied } = renderBar();
    expect(screen.getByRole('slider', { name: /Speed/ })).toHaveAccessibleName('Speed 10×');
    fireEvent.change(screen.getByRole('slider', { name: /Speed/ }), { target: { value: '3' } });
    expect(applied().speed).toBeCloseTo(100);
  });

  it('cycles through preset speeds with a single button when compact', async () => {
    const { applied } = renderBar(midway, 'compact');
    expect(screen.queryByRole('slider', { name: /Speed/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Speed 10×. Change speed' }));
    expect(applied().speed).toBe(30);
  });
});
