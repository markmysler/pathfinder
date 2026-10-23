import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlgorithmPicker } from './AlgorithmPicker';

describe('AlgorithmPicker', () => {
  it('offers every algorithm with its badge and description', () => {
    render(<AlgorithmPicker value="astar" onChange={() => {}} />);
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    const astar = screen.getByRole('radio', { name: /A\* search/ });
    expect(astar).toBeChecked();
    expect(astar.closest('label')).toHaveTextContent('Dijkstra steered by a distance estimate');
    expect(
      screen.getByRole('radio', { name: /Breadth-first search/ }).closest('label'),
    ).toHaveTextContent('BFS');
  });

  it('reports the algorithm the user picks', async () => {
    const onChange = vi.fn();
    render(<AlgorithmPicker value="astar" onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: /Dijkstra/ }));
    expect(onChange).toHaveBeenCalledWith('dijkstra');
  });
});
