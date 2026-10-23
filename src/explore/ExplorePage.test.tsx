import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServicesProvider } from '../app/services';
import { fakeGeocoder, fakeJobResult, fakeTraffic } from '../test/fakes';
import type { AlgorithmId } from '../algorithms';
import { liveTraffic } from '../test/traffic';
import type { JobRequest, JobResult, Stage, TrafficOutcome } from '../worker/job';
import type { JobError } from '../worker/protocol';
import { ExplorePage } from './ExplorePage';

// The real map needs WebGL; this stand-in lets tests "click" it.
vi.mock('../map/MapCanvas', () => ({
  MapCanvas: ({ onMapClick }: { onMapClick(point: { lat: number; lon: number }): void }) => (
    <button type="button" onClick={() => onMapClick({ lat: -34.61, lon: -58.38 })}>
      Click the map
    </button>
  ),
}));

function fakeSearchClient() {
  const jobs: {
    request: JobRequest;
    progress(stage: Stage): void;
    traffic?: (done: number, total: number) => void;
    succeed(result: JobResult): void;
    fail(error: JobError): void;
    cancel: ReturnType<typeof vi.fn>;
  }[] = [];
  return {
    jobs,
    client: {
      run: vi.fn(
        (
          request: JobRequest,
          onProgress: (stage: Stage) => void,
          onTraffic?: (done: number, total: number) => void,
        ) => {
          let succeed!: (result: JobResult) => void;
          let fail!: (error: JobError) => void;
          const result = new Promise<JobResult>((resolve, reject) => {
            succeed = resolve;
            fail = reject;
          });
          const cancel = vi.fn();
          jobs.push({ request, progress: onProgress, traffic: onTraffic, succeed, fail, cancel });
          return { result, cancel };
        },
      ),
    },
  };
}

function setup(traffic = fakeTraffic()) {
  const geocoder = fakeGeocoder();
  const search = fakeSearchClient();
  render(
    <ServicesProvider value={{ geocoder, searchClient: search.client, traffic }}>
      <ExplorePage />
    </ServicesProvider>,
  );
  return { geocoder, traffic, ...search };
}

/** Makes the page lay itself out for a phone. */
function pretendToBeAPhone() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query === '(max-width: 720px)',
    addEventListener() {},
    removeEventListener() {},
  }));
}

afterEach(() => vi.unstubAllGlobals());

/** Unticks the algorithms chosen by default, leaving only `name`. */
async function chooseOnly(name: string) {
  for (const box of screen.getAllByRole('checkbox')) {
    const wanted = box === screen.getByRole('checkbox', { name });
    if ((box as HTMLInputElement).checked !== wanted) await userEvent.click(box);
  }
}

async function choosePlaces() {
  await userEvent.type(screen.getByRole('textbox', { name: 'Start' }), 'casa{Enter}');
  await userEvent.click(await screen.findByRole('button', { name: /Casa Rosada/ }));
  await userEvent.type(screen.getByRole('textbox', { name: 'Destination' }), 'cabildo{Enter}');
  await userEvent.click(await screen.findByRole('button', { name: /Cabildo/ }));
}

describe('ExplorePage', () => {
  it('runs the chosen algorithm between the chosen places and plays the result', async () => {
    const { jobs } = setup();
    await choosePlaces();
    await userEvent.click(screen.getByRole('button', { name: 'Walk' }));
    await chooseOnly('Dijkstra');
    await userEvent.click(screen.getByRole('button', { name: 'Run Dijkstra' }));

    expect(jobs[0]!.request).toMatchObject({
      start: { lat: -34.608, lon: -58.3703 },
      target: { lat: -34.6087, lon: -58.3738 },
      mode: 'walk',
      objective: 'fastest',
      algorithms: ['dijkstra'],
      astarWeight: 1,
    });

    jobs[0]!.progress('download');
    expect(await screen.findByText(/Downloading streets/)).toBeInTheDocument();

    jobs[0]!.succeed(fakeJobResult('dijkstra'));
    expect(await screen.findByRole('heading', { name: 'Dijkstra' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Jump to end' }));
    expect(screen.getByText('Found route')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Route' })).toBeInTheDocument();
  });

  it('goes back to planning with everything kept', async () => {
    const { jobs } = setup();
    await choosePlaces();
    await chooseOnly('A* search');
    await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
    jobs[0]!.succeed(fakeJobResult());
    await userEvent.click(await screen.findByRole('button', { name: 'Edit setup' }));
    expect(screen.getByRole('textbox', { name: 'Start' })).toHaveValue('Casa Rosada');
    expect(screen.getByRole('button', { name: 'Run A* search' })).toBeEnabled();
  });

  it('explains failures and can try again', async () => {
    const { jobs, client } = setup();
    await choosePlaces();
    await chooseOnly('A* search');
    await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
    jobs[0]!.fail({ kind: 'download', message: 'HTTP 504' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't download/i);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(client.run).toHaveBeenCalledTimes(2);
  });

  it('cancels a run in progress', async () => {
    const { jobs } = setup();
    await choosePlaces();
    await chooseOnly('A* search');
    await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(jobs[0]!.cancel).toHaveBeenCalled();
    jobs[0]!.fail({ kind: 'cancelled', message: 'Cancelled' });
    expect(await screen.findByRole('button', { name: 'Run A* search' })).toBeEnabled();
  });

  it('drops pins from map clicks and names them from their address', async () => {
    const { geocoder } = setup();
    geocoder.reverse.mockResolvedValueOnce({
      name: 'Avenida de Mayo 500',
      detail: 'Buenos Aires',
      lat: -34.61,
      lon: -58.38,
    });
    await userEvent.click(screen.getByRole('button', { name: 'Click the map' }));
    expect(geocoder.reverse).toHaveBeenCalledWith({ lat: -34.61, lon: -58.38 }, expect.anything());
    expect(await screen.findByDisplayValue('Avenida de Mayo 500')).toBeInTheDocument();
  });

  it('shows the route summary and an edit button in the header while watching', async () => {
    const { jobs } = setup();
    await choosePlaces();
    await chooseOnly('A* search');
    await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
    jobs[0]!.succeed(fakeJobResult());
    const banner = await screen.findByRole('banner');
    expect(within(banner).getByText('Casa Rosada')).toBeInTheDocument();
    expect(within(banner).getByText(/Car · Fastest/)).toBeInTheDocument();
  });

  describe('comparing algorithms', () => {
    const three: AlgorithmId[] = ['greedy', 'dijkstra', 'astar'];

    async function runComparison(chosen: AlgorithmId[] = three) {
      const search = setup();
      await choosePlaces();
      for (const box of screen.getAllByRole('checkbox')) {
        const wanted = chosen.includes((box as HTMLInputElement).value as AlgorithmId);
        if ((box as HTMLInputElement).checked !== wanted) await userEvent.click(box);
      }
      await userEvent.click(
        screen.getByRole('button', { name: `Run ${chosen.length} algorithms` }),
      );
      search.jobs[0]!.succeed(fakeJobResult(...chosen));
      await screen.findByRole('table');
      return search;
    }

    const maps = () => screen.getAllByRole('article').map((map) => map.getAttribute('aria-label'));

    it('runs every chosen algorithm in one job and shows a map for each', async () => {
      const { jobs } = await runComparison();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.request.algorithms).toEqual(three);
      expect(maps()).toEqual(['Greedy best-first', 'Dijkstra', 'A* search']);
      expect(screen.getAllByRole('group', { name: 'Playback' })).toHaveLength(1);
      expect(screen.getByText(/one clock for every map/)).toBeInTheDocument();
    });

    it('fills in the results as each search reaches B', async () => {
      await runComparison();
      const rows = () => screen.getAllByRole('row').slice(1);
      await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
      await userEvent.click(screen.getByRole('button', { name: 'Pause' }));
      expect(rows().every((row) => /Searching/.test(row.textContent!))).toBe(true);
      await userEvent.click(screen.getByRole('button', { name: 'Jump to end' }));
      expect(rows().every((row) => /Done · step/.test(row.textContent!))).toBe(true);
      expect(within(screen.getByRole('table')).getAllByText('best').length).toBeGreaterThan(0);
    });

    it('links the maps by default and can unlink them', async () => {
      await runComparison();
      const link = screen.getByRole('button', { name: 'Maps move together' });
      expect(link).toHaveAttribute('aria-pressed', 'true');
      await userEvent.click(link);
      expect(link).toHaveAttribute('aria-pressed', 'false');
    });

    it('stacks up to three maps on a phone, with chips to choose which', async () => {
      pretendToBeAPhone();
      await runComparison(['bfs', 'dfs', 'greedy', 'dijkstra', 'astar']);
      expect(screen.getByRole('heading', { name: 'Comparing 5' })).toBeInTheDocument();
      expect(maps()).toEqual(['Greedy best-first', 'Dijkstra', 'A* search']);

      const chips = screen.getByRole('group', { name: 'Maps to show, up to 3' });
      await userEvent.click(within(chips).getByRole('button', { name: 'BFS' }));
      expect(maps()).toEqual(['Breadth-first search', 'Dijkstra', 'A* search']);
      expect(within(chips).getByRole('button', { name: 'Greedy' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );

      // The results still list every search, and say which maps are hidden.
      const table = screen.getByRole('table');
      expect(within(table).getAllByRole('row')).toHaveLength(6);
      expect(within(table).getAllByText('hidden')).toHaveLength(2);
    });

    it('keeps the single-algorithm view when only one is chosen', async () => {
      const { jobs } = setup();
      await choosePlaces();
      await chooseOnly('A* search');
      await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
      jobs[0]!.succeed(fakeJobResult('astar'));
      expect(await screen.findByText('Inspector')).toBeInTheDocument();
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
    });
  });

  describe('live traffic', () => {
    const tomtom = { provider: 'tomtom' as const, keys: { tomtom: 'my-key' } };
    const withTraffic = (traffic: TrafficOutcome, ...chosen: AlgorithmId[]): JobResult => ({
      ...fakeJobResult(...chosen),
      mode: 'car',
      objective: 'fastest',
      traffic,
    });

    async function runAStar(traffic = fakeTraffic(tomtom)) {
      const search = setup(traffic);
      await choosePlaces();
      await chooseOnly('A* search');
      await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
      return search;
    }

    it('adds a key from the plan, keeping it in this browser', async () => {
      const { traffic } = setup();
      await userEvent.click(screen.getByRole('button', { name: 'Add key' }));
      const dialog = screen.getByRole('dialog', { name: 'Live traffic' });
      await userEvent.type(within(dialog).getByLabelText('Your TomTom API key'), 'my-key');
      await userEvent.click(within(dialog).getByRole('button', { name: 'Save and turn on' }));
      expect(traffic.save).toHaveBeenLastCalledWith(tomtom);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'Live traffic' })).toHaveAttribute(
        'aria-checked',
        'true',
      );
    });

    it('tests a key with the traffic service', async () => {
      const { traffic } = setup();
      await userEvent.click(screen.getByRole('button', { name: 'Add key' }));
      await userEvent.type(screen.getByLabelText('Your TomTom API key'), 'k');
      await userEvent.click(screen.getByRole('button', { name: 'Test key' }));
      expect(traffic.check).toHaveBeenCalledWith({ provider: 'tomtom', key: 'k' });
      expect(await screen.findByText(/Works: TomTom/)).toBeInTheDocument();
    });

    it('sends the saved key with car runs, and not with walks', async () => {
      const { jobs } = await runAStar();
      expect(jobs[0]!.request.traffic).toEqual({ provider: 'tomtom', key: 'my-key' });
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      await userEvent.click(screen.getByRole('button', { name: 'Walk' }));
      await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
      expect(jobs[1]!.request.traffic).toBeUndefined();
    });

    it('counts the traffic tiles while downloading', async () => {
      const { jobs } = await runAStar();
      act(() => {
        jobs[0]!.progress('download');
        jobs[0]!.traffic!(12, 36);
      });
      expect(screen.getByRole('status')).toHaveTextContent(/Traffic from TomTom\s*12 of 36 tiles/);
    });

    it('tells how traffic changed the route once it is found', async () => {
      const { jobs } = await runAStar();
      jobs[0]!.succeed(withTraffic(liveTraffic(), 'astar'));
      const banner = await screen.findByRole('banner');
      expect(within(banner).getByText(/Live traffic, TomTom, 14:32/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Traffic' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      await userEvent.click(screen.getByRole('button', { name: 'Jump to end' }));
      expect(screen.getByRole('heading', { name: 'Traffic changed the route' })).toBeVisible();
      expect(screen.getByText(/Live speeds on 1,840 of 2,310/)).toBeVisible();
      expect(screen.getByText(/A\* still finds the best route with traffic/)).toBeVisible();
    });

    it('explains a failed key after the run, and the plan remembers it', async () => {
      const { jobs } = await runAStar();
      jobs[0]!.succeed(
        withTraffic({ status: 'failed', provider: 'tomtom', reason: 'key' }, 'astar'),
      );
      expect(await screen.findByText(/No live traffic: TomTom refused your key\./)).toBeVisible();
      await userEvent.click(screen.getByRole('button', { name: 'Check key' }));
      expect(screen.getByRole('dialog', { name: 'Live traffic' })).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Close' }));
      await userEvent.click(screen.getByRole('button', { name: 'Edit setup' }));
      expect(screen.getByText('TomTom refused your key.')).toBeInTheDocument();
    });

    it('says in the comparison results that traffic was live, and the time without it', async () => {
      const search = setup(fakeTraffic(tomtom));
      await choosePlaces();
      await userEvent.click(screen.getByRole('button', { name: 'Run 3 algorithms' }));
      search.jobs[0]!.succeed(withTraffic(liveTraffic(), 'greedy', 'dijkstra', 'astar'));
      const results = await screen.findByRole('region', { name: 'Results' });
      expect(within(results).getByText(/With live traffic, TomTom, 14:32/)).toBeInTheDocument();
      expect(
        within(results).getByText(/Without traffic the fastest route takes/),
      ).toHaveTextContent('Without traffic the fastest route takes 9:40.');
      expect(screen.getByRole('button', { name: 'Traffic' })).toBeInTheDocument();
    });

    it('notes failed traffic above the comparison results', async () => {
      const search = setup(fakeTraffic(tomtom));
      await choosePlaces();
      await userEvent.click(screen.getByRole('button', { name: 'Run 3 algorithms' }));
      search.jobs[0]!.succeed(
        withTraffic({ status: 'failed', provider: 'tomtom', reason: 'quota' }, 'greedy', 'astar'),
      );
      expect(await screen.findByText(/used up its requests/)).toBeVisible();
    });

    it('sums up the traffic in the phone sheet at the end', async () => {
      pretendToBeAPhone();
      const { jobs } = await runAStar();
      jobs[0]!.succeed(withTraffic(liveTraffic(), 'astar'));
      await screen.findByRole('region', { name: 'Playback' });
      await userEvent.click(screen.getByRole('button', { name: 'Jump to end' }));
      expect(screen.getByText('Traffic changed the route')).toBeVisible();
      expect(screen.getByText(/Avenida de Mayo is jammed/)).toBeVisible();
      expect(screen.getByRole('button', { name: 'Traffic' })).toBeInTheDocument();
    });
  });
});
