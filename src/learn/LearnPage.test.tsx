import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TOPICS } from './topics';
import { LearnPage } from './LearnPage';

function goTo(hash: string) {
  act(() => {
    window.location.hash = hash;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

afterEach(() => {
  window.location.hash = '';
  vi.unstubAllGlobals();
});

describe('LearnPage', () => {
  it('opens on the Learn home: where to start, every algorithm, and which to use when', () => {
    goTo('#/learn');
    render(<LearnPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Learn' })).toBeInTheDocument();
    const start = screen.getByRole('region', { name: 'Start here' });
    expect(
      within(start)
        .getAllByRole('link')
        .map((a) => a.getAttribute('href')),
    ).toEqual(['#/learn/graphs', '#/learn/roads', '#/learn/frontier', '#/learn/heuristics']);
    expect(
      within(screen.getByRole('region', { name: 'Algorithms' })).getAllByRole('link'),
    ).toHaveLength(5);
    expect(screen.getByRole('table')).toHaveTextContent('Lowest g + h');
  });

  it('lists every topic in the sidebar and marks the one open', () => {
    goTo('#/learn/astar');
    render(<LearnPage />);
    const nav = screen.getByRole('navigation', { name: 'Learn topics' });
    expect(within(nav).getByRole('link', { name: /A\* search/ })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(nav).getAllByText('Soon')).toHaveLength(4);
  });

  it('filters the sidebar as you search', async () => {
    goTo('#/learn');
    render(<LearnPage />);
    const nav = screen.getByRole('navigation', { name: 'Learn topics' });
    await userEvent.type(within(nav).getByRole('searchbox'), 'depth');
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Depth-first search']);
  });

  it.each(TOPICS.map((t) => [t.slug, t.title]))('renders the %s article', (slug, title) => {
    goTo(`#/learn/${slug}`);
    render(<LearnPage />);
    expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'More topics' })).toBeInTheDocument();
  });

  it('links an algorithm article to the map, with the algorithm chosen', () => {
    goTo('#/learn/astar');
    render(<LearnPage />);
    expect(screen.getByRole('link', { name: 'Watch A* on the map' })).toHaveAttribute(
      'href',
      '#/?algorithms=astar',
    );
    expect(screen.getByRole('link', { name: 'Race it against Dijkstra' })).toHaveAttribute(
      'href',
      '#/?algorithms=dijkstra,astar',
    );
  });

  it('says so when a topic does not exist', () => {
    goTo('#/learn/teleportation');
    render(<LearnPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'No such topic' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Learn' })).toHaveAttribute('href', '#/learn');
  });
});
