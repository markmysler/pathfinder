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

  describe('when algorithms prepare the map first', () => {
    const landmarks = { kind: 'landmarks', done: 8, total: 8, nodes: 23_307, ms: 34 } as const;
    const contracting = {
      kind: 'hierarchy',
      done: 13_984,
      total: 23_307,
      nodes: 23_307,
      shortcuts: 9_812,
    } as const;

    it('lists preparing as steps of its own, with how far contracting has got', () => {
      render(
        <LoadingPanel
          stage="prepare"
          running="4 algorithms"
          needs={['landmarks', 'hierarchy']}
          prepare={{ landmarks, hierarchy: contracting }}
          onCancel={() => {}}
        />,
      );
      const status = screen.getByRole('status');
      expect(status).toHaveTextContent('Getting ready to search');
      const steps = screen.getAllByRole('listitem').map((item) => item.textContent);
      expect(steps).toEqual([
        'Streets downloaded',
        'Graph built23,307 nodes',
        'ALT: 8 landmarks chosen34 ms',
        'CH: contracting the map60%13,984 of 23,307 nodes, 9,812 shortcuts',
        'Search 4 algorithms',
      ]);
      expect(screen.getAllByRole('img', { name: 'done' })).toHaveLength(3);
    });

    it('says when it reused what it made for the same roads', () => {
      render(
        <LoadingPanel
          stage="search"
          running="CH"
          needs={['hierarchy']}
          prepare={{
            hierarchy: { ...contracting, done: 23_307, ms: 228, reused: true },
          }}
          onCancel={() => {}}
        />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(
        'CH: shortcuts reused from your last run',
      );
    });

    it('keeps the usual message while the streets download', () => {
      render(
        <LoadingPanel stage="download" running="CH" needs={['hierarchy']} onCancel={() => {}} />,
      );
      expect(screen.getByRole('status')).toHaveTextContent(/Downloading streets/);
    });
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

  it('offline, says the streets are not on this device and offers the saved routes', async () => {
    const onShowSaved = vi.fn();
    const onRetry = vi.fn();
    render(
      <ErrorPanel
        error={{ kind: 'not-saved', message: '' }}
        saved={3}
        onRetry={onRetry}
        onBack={() => {}}
        onShowSaved={onShowSaved}
      />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent("These streets aren't on this device");
    expect(alert).toHaveTextContent(/outside every area you have run before/);
    expect(alert).toHaveTextContent('pick one of your 3 saved routes');
    await userEvent.click(screen.getByRole('button', { name: 'Show saved routes' }));
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onShowSaved).toHaveBeenCalled();
    expect(onRetry).toHaveBeenCalled();
  });

  it('offline with nothing saved, only says to connect', () => {
    render(
      <ErrorPanel
        error={{ kind: 'not-saved', message: '' }}
        saved={0}
        onRetry={() => {}}
        onBack={() => {}}
        onShowSaved={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/Connect to download the streets\.$/);
    expect(screen.queryByRole('button', { name: 'Show saved routes' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeVisible();
  });
});
