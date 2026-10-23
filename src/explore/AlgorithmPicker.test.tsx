import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlgorithmPicker } from './AlgorithmPicker';

describe('AlgorithmPicker', () => {
  it('offers every algorithm with its badge and description', () => {
    render(<AlgorithmPicker value={['astar']} onToggle={() => {}} />);
    expect(screen.getAllByRole('checkbox')).toHaveLength(8);
    const astar = screen.getByRole('checkbox', { name: /A\* search/ });
    expect(astar).toBeChecked();
    expect(astar.closest('label')).toHaveTextContent('Dijkstra steered by a distance estimate');
    expect(
      screen.getByRole('checkbox', { name: /Breadth-first search/ }).closest('label'),
    ).toHaveTextContent('BFS');
  });

  it('groups the searches that run from both ends, after the one-way ones', () => {
    render(<AlgorithmPicker value={[]} onToggle={() => {}} />);
    const both = screen.getByRole('group', { name: 'From both ends' });
    expect(Array.from(both.querySelectorAll('input')).map((box) => box.value)).toEqual([
      'bibfs',
      'bidijkstra',
      'biastar',
    ]);
    expect(both).toHaveTextContent('Search forward from A and backward from B at once.');
    expect(
      screen.getByRole('checkbox', { name: /Bidirectional Dijkstra/ }).closest('label'),
    ).toHaveTextContent('Same best route, about half the work.');
  });

  it('can choose several algorithms to compare, and says how many', () => {
    render(<AlgorithmPicker value={['greedy', 'dijkstra', 'astar']} onToggle={() => {}} />);
    const checked = screen
      .getAllByRole('checkbox')
      .filter((box) => (box as HTMLInputElement).checked);
    expect(checked).toHaveLength(3);
    expect(screen.getByRole('group', { name: /Algorithms/ })).toHaveTextContent('3 selected');
  });

  it('stops offering more algorithms once the limit is reached', () => {
    render(<AlgorithmPicker value={['dijkstra', 'astar']} limit={2} onToggle={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /Breadth-first search/ })).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /A\* search/ })).toBeEnabled();
    expect(screen.getByText('Up to 2 at once. Untick one to pick another.')).toBeInTheDocument();
  });

  it('reports the algorithm the user ticks or unticks', async () => {
    const onToggle = vi.fn();
    render(<AlgorithmPicker value={['astar']} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /^Dijkstra/ }));
    await userEvent.click(screen.getByRole('checkbox', { name: /A\* search/ }));
    expect(onToggle.mock.calls).toEqual([['dijkstra'], ['astar']]);
  });

  it("offers a weight for A*'s estimate while A* is ticked", () => {
    const onWeight = vi.fn();
    const { rerender } = render(
      <AlgorithmPicker value={['astar']} onToggle={() => {}} weight={1.5} onWeight={onWeight} />,
    );
    const slider = screen.getByRole('slider', { name: 'Estimate weight' });
    expect(slider).toHaveValue('1.5');
    expect(screen.getByText(/route can be up to 50% worse than the best/)).toBeInTheDocument();
    expect(screen.getByText(/Bidirectional A\* always uses 1×\./)).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '2.2' } });
    expect(onWeight).toHaveBeenCalledWith(2.2);

    rerender(
      <AlgorithmPicker value={['astar']} onToggle={() => {}} weight={1} onWeight={onWeight} />,
    );
    expect(screen.getByText(/guaranteed the best route/)).toBeInTheDocument();

    rerender(
      <AlgorithmPicker value={['dijkstra']} onToggle={() => {}} weight={1.5} onWeight={onWeight} />,
    );
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});
