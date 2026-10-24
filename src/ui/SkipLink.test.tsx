import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SkipLink } from './SkipLink';

describe('SkipLink', () => {
  afterEach(() => {
    window.location.hash = '';
  });

  it('is the first thing Tab reaches, and moves focus to what it names', async () => {
    window.location.hash = '#/learn/astar';
    render(
      <>
        <SkipLink target="article">Skip to the article</SkipLink>
        <a href="#/">Explore</a>
        <main id="article" tabIndex={-1}>
          The article
        </main>
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole('link', { name: 'Skip to the article' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();
    // Hash routing: the page stays where it was.
    expect(window.location.hash).toBe('#/learn/astar');
  });
});
