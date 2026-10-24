import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeGeocoder, fakeTraffic } from '../test/fakes';
import { App } from './App';

vi.mock('../map/LazyMapCanvas', () => ({ LazyMapCanvas: () => <div>map</div> }));

// The service worker, as vite-plugin-pwa reports it: whether a new version is waiting.
const worker = { needRefresh: false, updateServiceWorker: vi.fn() };
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [worker.needRefresh, () => {}],
    updateServiceWorker: worker.updateServiceWorker,
  }),
}));

// Explore loads lazily; the first test to show it waits for its modules to be compiled.
const lazily = { timeout: 10_000 };

const services = {
  geocoder: fakeGeocoder(),
  searchClient: {
    run: vi.fn(),
    savedAreas: vi.fn(async () => []),
    forgetArea: vi.fn(async () => []),
  },
  traffic: fakeTraffic(),
};

describe('App', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('opens on Explore with Explore and Learn in the navigation', async () => {
    render(<App services={services} />);
    expect(await screen.findByRole('textbox', { name: 'Start' }, lazily)).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]!;
    expect(nav).toHaveTextContent('Explore');
    expect(nav).toHaveTextContent('Learn');
  });

  it('opens Explore with the algorithms a Learn article links to', async () => {
    window.location.hash = '#/?algorithms=dijkstra,astar';
    render(<App services={services} />);
    const ticked = (await screen.findAllByRole('checkbox', {}, lazily))
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => (box as HTMLInputElement).value);
    expect(ticked).toEqual(['dijkstra', 'astar']);
  });

  it('offers a new version once it is ready, and reloads into it', async () => {
    worker.needRefresh = true;
    render(<App services={services} />);
    await screen.findByRole('textbox', { name: 'Start' }, lazily);
    const prompt = screen.getByRole('status');
    expect(prompt).toHaveTextContent('Pathfinder has been updated.');
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(worker.updateServiceWorker).toHaveBeenCalledWith(true);
    worker.needRefresh = false;
  });

  it('says when the connection comes back', async () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    render(<App services={services} />);
    await screen.findByRole('textbox', { name: 'Start' }, lazily);
    act(() => {
      onLine.mockReturnValue(true);
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Back online.');
    onLine.mockRestore();
  });

  it('switches to Learn', async () => {
    render(<App services={services} />);
    await userEvent.click((await screen.findAllByRole('link', { name: 'Learn' }, lazily))[0]!);
    expect(
      await screen.findByRole('heading', { name: 'Learn', level: 1 }, lazily),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Learn' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
