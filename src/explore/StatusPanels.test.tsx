import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorPanel, LoadingPanel } from './StatusPanels';

afterEach(() => {
  vi.useRealTimers();
});

describe('LoadingPanel', () => {
  it.each([
    [null, /Getting ready/],
    ['download', /Downloading streets from OpenStreetMap/],
    ['graph', /Building the road graph/],
    ['search', /Running A\* search/],
  ] as const)('describes the %s stage', (stage, text) => {
    render(<LoadingPanel stage={stage} running="A* search" onCancel={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('warns that downloads can be slow', () => {
    render(<LoadingPanel stage="download" running="A* search" onCancel={() => {}} />);
    expect(screen.getByRole('status')).toHaveTextContent(/up to a minute/);
  });

  it('says when it has moved on to another server', () => {
    render(
      <LoadingPanel
        stage="download"
        server={{ host: 'maps.mail.ru', attempt: 2 }}
        running="A* search"
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      "The first server didn't answer, so Pathfinder is trying maps.mail.ru (2 of 3).",
    );
  });

  it('counts the time spent waiting', () => {
    vi.useFakeTimers();
    render(<LoadingPanel stage="download" running="A* search" onCancel={() => {}} />);
    act(() => vi.advanceTimersByTime(42_000));
    expect(screen.getByText('0:42 so far')).toBeInTheDocument();
  });

  describe('with live traffic on', () => {
    it('downloads streets and traffic at once, counting the tiles', () => {
      render(
        <LoadingPanel
          stage="download"
          running="A* search"
          traffic={{ provider: 'tomtom', done: 12, total: 36 }}
          onCancel={() => {}}
        />,
      );
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('Downloading streets and live traffic…');
      expect(status).toHaveTextContent(/Streets from OpenStreetMap\s*up to a minute/);
      expect(status).toHaveTextContent(/Traffic from TomTom\s*12 of 36 tiles/);
    });

    it('says when the traffic has all arrived', () => {
      render(
        <LoadingPanel
          stage="download"
          running="A* search"
          traffic={{ provider: 'here', done: 1, total: 1 }}
          onCancel={() => {}}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(/Traffic from HERE\s*arrived/);
    });

    it('waits for traffic once the streets are in', () => {
      render(
        <LoadingPanel
          stage="traffic"
          running="A* search"
          traffic={{ provider: 'tomtom' }}
          onCancel={() => {}}
        />,
      );
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('Waiting for live traffic…');
      expect(status).toHaveTextContent(/Streets from OpenStreetMap\s*done/);
      expect(status).toHaveTextContent(/Traffic from TomTom\s*asking/);
    });
  });

  it('can be cancelled', async () => {
    const onCancel = vi.fn();
    render(<LoadingPanel stage="download" running="A* search" onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});

describe('ErrorPanel', () => {
  it.each([
    [{ kind: 'route-too-long', message: '', meters: 20_000 } as const, /20\.0 km apart.*15 km/],
    [{ kind: 'no-road', message: '' } as const, /no connected roads/i],
    [{ kind: 'download', message: '' } as const, /couldn't download the streets/i],
    [{ kind: 'unknown', message: 'boom' } as const, /Something went wrong: boom/],
  ])('explains %o', (error, text) => {
    render(<ErrorPanel error={error} onRetry={() => {}} onBack={() => {}} />);
    expect(screen.getByRole('alert')).toHaveTextContent(text);
  });

  it('offers to try again or go back', async () => {
    const onRetry = vi.fn();
    const onBack = vi.fn();
    render(
      <ErrorPanel error={{ kind: 'download', message: '' }} onRetry={onRetry} onBack={onBack} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onRetry).toHaveBeenCalled();
    expect(onBack).toHaveBeenCalled();
  });
});
