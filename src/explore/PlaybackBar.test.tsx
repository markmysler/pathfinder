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
  it('marks the step where the two sides of a bidirectional search first met', () => {
    const { unmount } = render(
      <PlaybackBar playback={midway} total={total} onChange={() => {}} meetAt={4_388} />,
    );
    expect(screen.getByText(/Step/).closest('label')).toHaveTextContent('Sides met at 4,388');
    const tick = screen.getByTitle('Sides met at step 4,388');
    expect(tick.style.left).toBe(`${(100 * 4_388) / total}%`);
    unmount();
    render(
      <PlaybackBar
        playback={midway}
        total={total}
        onChange={() => {}}
        variant="compact"
        meetAt={4_388}
      />,
    );
    expect(screen.getByText(/Step/).closest('label')).toHaveTextContent('met at 4,388');
  });

  it('can note what the clock drives and mark where searches finished', () => {
    render(
      <PlaybackBar
        playback={midway}
        total={total}
        onChange={() => {}}
        note="one clock for every map"
        marks={[{ label: 'GBF', color: '#F5B83D', step: 1_203 }]}
      />,
    );
    expect(screen.getByText(/Step/).closest('label')).toHaveTextContent(
      'Step 4,812 of 9,874 · one clock for every map',
    );
    const marks = screen.getByRole('list', { name: 'Where each search finished' });
    expect(marks).toHaveTextContent('GBF');
    expect(screen.getByText('GBF').closest('li')).toHaveAccessibleName(
      'GBF finished at step 1,203',
    );
  });

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

describe('PlaybackBar for Bellman-Ford', () => {
  it('steps a whole round at a time, and says which round it is in', async () => {
    const onChange = vi.fn();
    const back = vi.fn();
    const forward = vi.fn();
    render(
      <PlaybackBar
        playback={midway}
        total={total}
        onChange={onChange}
        rounds={{ label: 'round 41 of 97', onBack: back, onForward: forward }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'Step back' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Back one round' }));
    await userEvent.click(screen.getByRole('button', { name: 'Forward one round' }));
    expect([back.mock.calls.length, forward.mock.calls.length]).toEqual([1, 1]);
    expect(screen.getByText(/Step/).closest('label')).toHaveTextContent('round 41 of 97');
  });
});

describe('PlaybackBar for preparing', () => {
  it('counts what it is replaying in its own words, and can skip to the search', async () => {
    const onSkip = vi.fn();
    render(
      <PlaybackBar
        playback={midway}
        total={total}
        onChange={() => {}}
        label="Contracted 4,812 of 9,874 nodes · 3,100 shortcuts so far"
        onSkip={onSkip}
      />,
    );
    expect(screen.getByText(/^Contracted/).closest('label')).toHaveTextContent(
      'Contracted 4,812 of 9,874 nodes · 3,100 shortcuts so far',
    );
    expect(screen.queryByRole('button', { name: 'Jump to end' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Skip to the search' }));
    expect(onSkip).toHaveBeenCalled();
  });
});
