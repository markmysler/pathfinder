import { act, render, screen } from '@testing-library/react';
import { BackOnlineNote, OfflineChip } from './Connection';

describe('OfflineChip', () => {
  it('says what still works while offline', () => {
    render(<OfflineChip online={false} detail="saved routes and Learn still work" />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Offline · saved routes and Learn still work',
    );
  });

  it('shows nothing online', () => {
    render(<OfflineChip online detail="saved routes only" />);
    expect(screen.queryByRole('status')).toBeNull();
  });
});

describe('BackOnlineNote', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('says so for four seconds when the connection comes back', () => {
    vi.useFakeTimers();
    const { rerender } = render(<BackOnlineNote online />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<BackOnlineNote online={false} />);
    expect(screen.queryByRole('status')).toBeNull();
    rerender(<BackOnlineNote online />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Back online. Search and live traffic work again.',
    );
    act(() => vi.advanceTimersByTime(3900));
    expect(screen.getByRole('status')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(200));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
