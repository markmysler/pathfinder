import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlgorithmPicker } from './AlgorithmPicker';

describe('AlgorithmPicker', () => {
  it('offers every algorithm with its badge and description', () => {
    render(<AlgorithmPicker value={['astar']} onToggle={() => {}} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(5);
    const astar = screen.getByRole('checkbox', { name: /A\* search/ });
    expect(astar).toBeChecked();
    expect(astar.closest('label')).toHaveTextContent('Dijkstra steered by a distance estimate');
    expect(
      screen.getByRole('checkbox', { name: /Breadth-first search/ }).closest('label'),
    ).toHaveTextContent('BFS');
  });

  it('can choose several algorithms to compare, and says how many', () => {
    render(<AlgorithmPicker value={['greedy', 'dijkstra', 'astar']} onToggle={() => {}} />);
    const checked = screen
      .getAllByRole('checkbox')
      .filter((box) => (box as HTMLInputElement).checked);
    expect(checked).toHaveLength(3);
    expect(screen.getByRole('group', { name: /Algorithms/ })).toHaveTextContent('3 selected');
  });

  it('reports the algorithm the user ticks or unticks', async () => {
    const onToggle = vi.fn();
    render(<AlgorithmPicker value={['astar']} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /Dijkstra/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /A\* search/ }));
    expect(onToggle.mock.calls).toEqual([['dijkstra'], ['astar']]);
  });
});
