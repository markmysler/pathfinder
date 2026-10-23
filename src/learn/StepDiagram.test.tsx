import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SIX } from './networks';
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
});
