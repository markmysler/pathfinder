import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SIX, TRAP } from './networks';
import { StepDiagram } from './StepDiagram';

const caption = () => screen.getByRole('figure').querySelector('figcaption')!;

describe('StepDiagram', () => {
  it('steps through a real A* run, one expansion at a time', async () => {
    render(<StepDiagram network={SIX} algorithm="astar" compareWith="dijkstra" />);
    expect(screen.getByText(/of/).closest('p')).toHaveTextContent('Step 1 of 4');
    expect(caption()).toHaveTextContent('Step 1. Only S is in the frontier, so A* takes it first.');
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(caption()).toHaveTextContent(/^Step 3\. S and A are explored\./);
    expect(screen.getByRole('button', { name: 'Previous step' })).toBeEnabled();
  });

  it('replays the same network as Dijkstra, and back', async () => {
    render(<StepDiagram network={SIX} algorithm="astar" compareWith="dijkstra" />);
    const toggle = screen.getByRole('button', { name: 'Show as Dijkstra' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/of/).closest('p')).toHaveTextContent('Step 1 of 6');
    expect(caption()).toHaveTextContent(/Dijkstra takes it first/);
    await userEvent.click(toggle);
    expect(caption()).toHaveTextContent(/A\* takes it first/);
  });

  it('ends on the route, compared with the cheapest', async () => {
    render(<StepDiagram network={SIX} algorithm="dfs" compareWith="bfs" />);
    for (let i = 0; i < 5; i++)
      await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(caption()).toHaveTextContent('costs 12; the cheapest costs 6.');
    expect(screen.getByRole('button', { name: 'Next step' })).toBeDisabled();
  });

  it('describes the picture for screen readers', () => {
    render(<StepDiagram network={SIX} algorithm="astar" />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/S: start, next/);
  });

  it('steps through a search from both ends, saying which side took each step', async () => {
    render(<StepDiagram network={TRAP} algorithm="bidijkstra" compareWith="dijkstra" />);
    expect(screen.getByText(/of/).closest('p')).toHaveTextContent('Step 1 of 4 · from A');
    await userEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText(/of/).closest('p')).toHaveTextContent('Step 2 of 4 · from B');
    expect(caption()).toHaveTextContent(
      /^Step 2\. B explored T and reached P and R\. A had already reached P, so the sides meet there/,
    );
    expect(screen.getByRole('img')).toHaveAccessibleName(
      /P: reached from A, 1, and to B, 10; best meeting so far/,
    );
    expect(screen.getByRole('list', { name: 'Key' })).toHaveTextContent('Best meeting so far');
  });

  it('replays a search from both ends as the one-way search', async () => {
    render(<StepDiagram network={TRAP} algorithm="bidijkstra" compareWith="dijkstra" />);
    await userEvent.click(screen.getByRole('button', { name: 'Show as Dijkstra' }));
    expect(caption()).toHaveTextContent(/Dijkstra takes it first/);
    expect(screen.getByText(/of/).closest('p')).not.toHaveTextContent('from A');
  });
});
