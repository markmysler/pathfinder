import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { fakeGeocoder } from '../test/fakes';
import { App } from './App';

vi.mock('../map/MapCanvas', () => ({ MapCanvas: () => <div>map</div> }));

const services = { geocoder: fakeGeocoder(), searchClient: { run: vi.fn() } };

describe('App', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('opens on Explore with Explore and Learn in the navigation', () => {
    render(<App services={services} />);
    const nav = screen.getAllByRole('navigation', { name: 'Main' })[0]!;
    expect(nav).toHaveTextContent('Explore');
    expect(nav).toHaveTextContent('Learn');
    expect(screen.getByRole('textbox', { name: 'Start' })).toBeInTheDocument();
  });

  it('opens Explore with the algorithms a Learn article links to', () => {
    window.location.hash = '#/?algorithms=dijkstra,astar';
    render(<App services={services} />);
    const ticked = screen
      .getAllByRole('checkbox')
      .filter((box) => (box as HTMLInputElement).checked)
      .map((box) => (box as HTMLInputElement).value);
    expect(ticked).toEqual(['dijkstra', 'astar']);
  });

  it('switches to Learn', async () => {
    render(<App services={services} />);
    await userEvent.click(screen.getAllByRole('link', { name: 'Learn' })[0]!);
    expect(await screen.findByRole('heading', { name: 'Learn', level: 1 })).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Learn' })[0]).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
