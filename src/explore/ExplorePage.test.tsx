import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServicesProvider } from '../app/services';
import { fakeGeocoder, fakeJobResult } from '../test/fakes';
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
    await userEvent.click(screen.getByRole('radio', { name: 'Dijkstra' }));
    await userEvent.click(screen.getByRole('button', { name: 'Run Dijkstra' }));

    expect(jobs[0]!.request).toMatchObject({
      start: { lat: -34.608, lon: -58.3703 },
      target: { lat: -34.6087, lon: -58.3738 },
      mode: 'walk',
      objective: 'fastest',
      algorithm: 'dijkstra',
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
    await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
    jobs[0]!.succeed(fakeJobResult());
    await userEvent.click(await screen.findByRole('button', { name: 'Edit setup' }));
    expect(screen.getByRole('textbox', { name: 'Start' })).toHaveValue('Casa Rosada');
    expect(screen.getByRole('button', { name: 'Run A* search' })).toBeEnabled();
  });

  it('explains failures and can try again', async () => {
    const { jobs, client } = setup();
    await choosePlaces();
    await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
    jobs[0]!.fail({ kind: 'download', message: 'HTTP 504' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't download/i);
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(client.run).toHaveBeenCalledTimes(2);
  });

  it('cancels a run in progress', async () => {
    const { jobs } = setup();
    await choosePlaces();
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
    await userEvent.click(screen.getByRole('button', { name: 'Run A* search' }));
    jobs[0]!.succeed(fakeJobResult());
    const banner = await screen.findByRole('banner');
    expect(within(banner).getByText('Casa Rosada')).toBeInTheDocument();
    expect(within(banner).getByText(/Car · Fastest/)).toBeInTheDocument();
  });
});
