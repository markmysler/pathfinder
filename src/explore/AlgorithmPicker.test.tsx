import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlgorithmPicker } from './AlgorithmPicker';

describe('AlgorithmPicker', () => {
  it('offers every algorithm with its badge and description', async () => {
    render(<AlgorithmPicker value={['astar']} onToggle={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /From both ends/ }));
    expect(screen.getAllByRole('checkbox')).toHaveLength(11);
    const astar = screen.getByRole('checkbox', { name: /A\* search/ });
    expect(astar).toBeChecked();
    expect(astar.closest('label')).toHaveTextContent('Dijkstra steered by a distance estimate');
    expect(
      screen.getByRole('checkbox', { name: /Breadth-first search/ }).closest('label'),
    ).toHaveTextContent('BFS');
  });

  it('folds away the searches from both ends until asked, saying how many are chosen', async () => {
    const { rerender } = render(<AlgorithmPicker value={['astar']} onToggle={() => {}} />);
    const toggle = screen.getByRole('button', { name: /From both ends/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveTextContent('3 searches · none selected');
    expect(screen.queryByRole('checkbox', { name: /Bidirectional/ })).not.toBeInTheDocument();
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('checkbox', { name: /Bidirectional/ })).toHaveLength(3);
    // Open from the start when one of them is chosen.
    rerender(<AlgorithmPicker key="again" value={['bidijkstra']} onToggle={() => {}} />);
    expect(screen.getByRole('button', { name: /From both ends/ })).toHaveTextContent(
      '1 of 3 selected',
    );
    expect(screen.getByRole('checkbox', { name: /Bidirectional Dijkstra/ })).toBeChecked();
  });

  it('groups the searches that run from both ends, after the one-way ones', () => {
    render(<AlgorithmPicker value={['bibfs']} onToggle={() => {}} />);
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

  it('lists the advanced algorithms apart, marking those that prepare the map first', () => {
    render(<AlgorithmPicker value={['alt']} onToggle={() => {}} />);
    const advanced = screen.getByRole('group', { name: /Advanced/ });
    expect(Array.from(advanced.querySelectorAll('input')).map((box) => box.value)).toEqual([
      'bellmanford',
      'alt',
      'ch',
    ]);
    expect(advanced).toHaveTextContent('1 of 3 selected');
    expect(advanced).toHaveTextContent('roads that cost less than nothing');
    const prepares = (name: RegExp) =>
      screen
        .getByRole('checkbox', { name })
        .closest('label')!
        .textContent!.includes('Prepares first');
    expect(prepares(/Bellman-Ford/)).toBe(false);
    expect(prepares(/ALT/)).toBe(true);
    expect(prepares(/Contraction hierarchies/)).toBe(true);
  });

  it('says preparing is reused for later routes once ALT or CH is ticked', () => {
    const note = /prepare these roads once, then reuse it/;
    const { rerender } = render(<AlgorithmPicker value={['bellmanford']} onToggle={() => {}} />);
    expect(screen.queryByText(note)).not.toBeInTheDocument();
    rerender(<AlgorithmPicker value={['ch']} onToggle={() => {}} />);
    expect(screen.getByText(note)).toBeInTheDocument();
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
