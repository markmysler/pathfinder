import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeGeocoder, fakeTraffic } from '../test/fakes';
import { App } from './App';

vi.mock('../map/LazyMapCanvas', () => ({ LazyMapCanvas: () => <div>map</div> }));

const services = {
  geocoder: fakeGeocoder(),
  searchClient: { run: vi.fn() },
  traffic: fakeTraffic(),
};

describe('App', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('opens on Explore with Explore and Learn in the navigation', async () => {
    render(<App services={services} />);
    expect(await screen.findByRole('textbox', { name: 'Start' })).toBeInTheDocument();
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]!;
    expect(nav).toHaveTextContent('Explore');
    expect(nav).toHaveTextContent('Learn');
  });

  it('opens Explore with the algorithms a Learn article links to', async () => {
    window.location.hash = '#/?algorithms=dijkstra,astar';
    render(<App services={services} />);
    const ticked = (await screen.findAllByRole('checkbox'))
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => (box as HTMLInputElement).value);
    expect(ticked).toEqual(['dijkstra', 'astar']);
  });

  it('switches to Learn', async () => {
    render(<App services={services} />);
    await userEvent.click((await screen.findAllByRole('link', { name: 'Learn' }))[0]!);
    expect(await screen.findByRole('heading', { name: 'Learn', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Learn' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
