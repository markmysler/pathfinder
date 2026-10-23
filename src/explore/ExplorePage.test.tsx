import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServicesProvider } from '../app/services';
import { fakeGeocoder, fakeJobResult } from '../test/fakes';
import type { AlgorithmId } from '../algorithms';
import type { JobRequest, JobResult, Stage } from '../worker/job';
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
    succeed(result: JobResult): void;
    fail(error: JobError): void;
    cancel: ReturnType<typeof vi.fn>;
  }[] = [];
  return {
    jobs,
    client: {
      run: vi.fn((request: JobRequest, onProgress: (stage: Stage) => void) => {
        let succeed!: (result: JobResult) => void;
        let fail!: (error: JobError) => void;
        const result = new Promise<JobResult>((resolve, reject) => {
          succeed = resolve;
          fail = reject;
        });
        const cancel = vi.fn();
        jobs.push({ request, progress: onProgress, succeed, fail, cancel });
        return { result, cancel };
      }),
    },
  };
}

function setup() {
  const geocoder = fakeGeocoder();
  const search = fakeSearchClient();
  render(
    <ServicesProvider value={{ geocoder, searchClient: search.client }}>
      <ExplorePage />
    </ServicesProvider>,
  );
  return { geocoder, ...search };
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
});
