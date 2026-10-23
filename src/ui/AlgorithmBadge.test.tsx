import { render } from '@testing-library/react';
import { AlgorithmBadge } from './AlgorithmBadge';

describe('AlgorithmBadge', () => {
  it('shows the badge text, hidden from screen readers next to the name', () => {
    const { container } = render(<AlgorithmBadge algorithm="dijkstra" className="b" />);
    const badge = container.firstElementChild!;
    expect(badge).toHaveTextContent('DIJ');
    expect(badge).toHaveClass('b');
    expect(badge).toHaveAttribute('aria-hidden', 'true');
    expect(badge.querySelector('svg')).toBeNull();
  });

  it('adds two-way arrows for a search from both ends', () => {
    const { container } = render(<AlgorithmBadge algorithm="bidijkstra" />);
    expect(container.firstElementChild).toHaveTextContent('DIJ');
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
