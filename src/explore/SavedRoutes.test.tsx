import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { SavedArea } from '../osm/saved';
import { SavedRoutes } from './SavedRoutes';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 9, 24, 15, 0).getTime();

function area(name: string, start: string, target: string, daysAgo: number, mb: number) {
  const shift = daysAgo / 100;
  return {
    key: name,
    box: { south: -34.62, west: -58.4, north: -34.58, east: -58.36 },
    savedAt: now - daysAgo * DAY,
    bytes: mb * 1_000_000,
    start: { name: start, lat: -34.5875 + shift, lon: -58.3933 },
    // About 3.1 km south-east of the start.
    target: { name: target, lat: -34.6083 + shift, lon: -58.3712 },
  } satisfies SavedArea;
}

const areas = [
  area('a', 'Recoleta Cemetery', 'Plaza de Mayo', 0, 4.1),
  area('b', 'Barrancas de Belgrano', 'Plaza de Mayo', 2, 13.3),
  area('c', 'Casa Rosada', 'Cabildo de Buenos Aires', 6, 1.5),
];

const props = {
  areas,
  start: null,
  target: null,
  now,
  onChoose: () => {},
  onForget: () => {},
};

describe('SavedRoutes', () => {
  it('lists the routes saved on this device, with how far, how recent and how big', () => {
    render(<SavedRoutes {...props} />);
    const list = screen.getByRole('region', { name: /Saved on this device/ });
    expect(within(list).getByRole('heading')).toHaveTextContent('Saved on this device18.9 MB');
    const routes = within(list).getAllByRole('button', { pressed: false });
    expect(routes.map((route) => route.textContent)).toEqual([
      'Recoleta Cemetery → Plaza de Mayo3.1 km apart · saved today · 4.1 MB',
      'Barrancas de Belgrano → Plaza de Mayo3.1 km apart · saved 2 days ago · 13.3 MB',
      'Casa Rosada → Cabildo de Buenos Aires3.1 km apart · saved 6 days ago, kept until tomorrow · 1.5 MB',
    ]);
    expect(list).toHaveTextContent('Streets you download are kept for a week after each run.');
  });

  it('marks the route being planned', () => {
    const [first] = areas;
    render(<SavedRoutes {...props} start={first!.start} target={first!.target} />);
    expect(screen.getByRole('button', { pressed: true })).toHaveTextContent(
      'Recoleta Cemetery → Plaza de Mayo',
    );
  });

  it('chooses a route, or removes its streets', async () => {
    const onChoose = vi.fn();
    const onForget = vi.fn();
    render(<SavedRoutes {...props} onChoose={onChoose} onForget={onForget} />);
    await userEvent.click(screen.getByRole('button', { name: /^Barrancas de Belgrano/ }));
    expect(onChoose).toHaveBeenCalledWith(areas[1]);
    await userEvent.click(
      screen.getByRole('button', {
        name: 'Remove the saved streets for Casa Rosada to Cabildo de Buenos Aires',
      }),
    );
    expect(onForget).toHaveBeenCalledWith(areas[2]);
  });

  it('on phones, says less and shows two until asked for more', async () => {
    render(<SavedRoutes {...props} phone />);
    const list = screen.getByRole('region', { name: /Saved on this phone/ });
    const routes = () => within(list).getAllByRole('button', { name: /→/ });
    expect(routes().map((route) => route.textContent)).toEqual([
      'Recoleta Cemetery → Plaza de Mayo3.1 km · today · 4.1 MB',
      'Barrancas de Belgrano → Plaza de Mayo3.1 km · 2 days ago · 13.3 MB',
    ]);
    await userEvent.click(within(list).getByRole('button', { name: '1 more saved route' }));
    expect(routes()).toHaveLength(3);
  });

  it('says how routes get saved when none are', () => {
    render(<SavedRoutes {...props} areas={[]} />);
    expect(screen.getByRole('region', { name: /Saved on this device/ })).toHaveTextContent(
      'Nothing is saved on this device yet. Routes you run online are kept for a week.',
    );
  });
});
